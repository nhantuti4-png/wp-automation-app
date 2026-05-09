import { Page } from 'playwright';
import { WorkflowMemory, SemanticIntent, TaskState, AISettings, WorkflowStep } from '../types.ts';
import { StrategyRunner } from './strategyRunner.ts';
import { createAIPlanner, AIPlanner } from './aiPlanners.ts';
import { persistenceManager } from './persistenceManager';
import { db as clientDb } from './firebase.ts';

export class AdaptiveAgent {
  private planner: AIPlanner | null = null;
  private db: any;
  private settings: AISettings;

  constructor(settings: AISettings, dbInstance?: any) {
    this.settings = settings;
    this.db = dbInstance || clientDb;
    this.planner = createAIPlanner(settings);
  }

  async getMemory(hostname: string, intent: SemanticIntent): Promise<WorkflowMemory | null> {
    try {
      const memory = await persistenceManager.getMemory(hostname, intent);
      if (memory) {
        console.log(`[AdaptiveMemory] Loaded workflow for ${intent} on ${hostname}`);
      }
      return memory;
    } catch (e) {
      console.warn("[AdaptiveAgent] Memory fetch failed:", e);
      return null;
    }
  }

  async saveMemory(memory: WorkflowMemory) {
    try {
      await persistenceManager.saveMemory(memory);
      console.log(`[AdaptiveMemory] Saved workflow successfully for ${memory.intent}`);
    } catch (e) {
      console.error("[AdaptiveAgent] Memory save failed:", e);
    }
  }

  async solveIntent(page: Page, task: TaskState, logger: (type: string, msg: string) => void): Promise<boolean> {
    const runner = new StrategyRunner(page, logger);
    const hostname = new URL(page.url()).hostname;

    // 0. FAST PATH (Deterministic)
    const fastPathSuccess = await runner.checkFastPath(task.currentIntent, task);
    if (fastPathSuccess) {
      if (await runner.validateIntent(task.currentIntent, task)) {
        logger('success', `[ADAPTIVE] Fast-path success for ${task.currentIntent}`);
        return true;
      }
    }

    // 1. MEMORY REPLAY
    if (this.settings.runtimeMode !== 'legacy') {
      const memory = await this.getMemory(hostname, task.currentIntent);
      
      if (memory) {
        const isStable = memory.stable || memory.successRate >= 0.9;
        
        if (memory.successRate > 0.1 || isStable) {
          logger('info', `[MEMORY] Testing ${isStable ? 'STABLE' : 'known'} strategy for ${task.currentIntent}...`);
          
          let success = false;
          try {
            let allStepsOk = true;
            for (const step of memory.steps) {
              const ok = await runner.runStep(step, task);
              if (!ok) { allStepsOk = false; break; }
            }
            
            if (allStepsOk && await runner.validateIntent(task.currentIntent, task)) {
              success = true;
            }
          } catch (e) {}

          if (success) {
            logger('success', `[MEMORY] Replay success. Confidence: ${Math.round(memory.successRate * 100)}%`);
            memory.successRate = Math.min(1, memory.successRate + 0.05);
            if (memory.successRate >= 0.9) memory.stable = true;
            memory.failCount = 0; // Reset fails on success
            await this.saveMemory(memory);
            return true;
          } else {
            logger('warn', `[MEMORY] ${isStable ? 'STABLE' : 'Replay'} strategy failed.`);
            memory.successRate = Math.max(0, memory.successRate - 0.1);
            memory.failCount = (memory.failCount || 0) + 1;
            
            if ((memory.failCount || 0) > 2) {
              logger('error', `[STABILITY] Intent ${task.currentIntent} lost stability. Forcing AI recovery.`);
              memory.stable = false;
            }
            
            await this.saveMemory(memory);
            
            // If stable, we might want to retry memory one more time or wait?
            // But user says: IF stable === true -> replay memory only.
            // Let's stick to: if stable and failed, return false (stop) OR try AI recovery if recovery mode is on.
            // Usually we want to continue, so let's allow AI recovery but log the stability loss.
            if (isStable && this.settings.recoveryMode !== 'ai_repair') {
                return false; 
            }
          }
        }
      }
    }

    // 2. AI PLANNING (Semantic/DOM Layer)
    if (this.settings.enableRecovery && (this.settings.runtimeMode === 'adaptive' || this.settings.runtimeMode === 'training')) {
      const memory = await this.getMemory(hostname, task.currentIntent);
      if (memory?.stable && memory?.successRate > 0.95) {
        // Absolute stability: skip AI if memory is perfect
        return false;
      }
      if (!this.planner) {
        logger('warn', `[AI] Skip AI planning: No AI provider or API Key configured.`);
        return false;
      }

      logger('info', `[AI PLANNER] Intent ${task.currentIntent} failed replay. Invoking AI semantic analysis...`);
      
      let aiResult = await this.askAITeacher(page, task, logger);
      
      // VISION FALLBACK
      if (!aiResult) {
        logger('info', `[VISION] DOM analysis inconclusive. Capture screenshot for vision reasoning...`);
        const screenshot = await page.screenshot({ type: 'png' }).then(buf => buf.toString('base64')).catch(() => undefined);
        if (screenshot) {
          aiResult = await this.askAITeacher(page, task, logger, screenshot);
        }
      }

      if (aiResult && aiResult.steps && aiResult.steps.length > 0) {
        logger('info', `[AI PLANNER] Strategy proposed: ${aiResult.strategy || 'Multi-step fix'}. Executing...`);
        
        let aiSuccess = true;
        for (const step of aiResult.steps) {
          const ok = await runner.runStep(step, task);
          if (!ok) { aiSuccess = false; break; }
        }

        if (aiSuccess && await runner.validateIntent(task.currentIntent, task)) {
          logger('success', `[AI SUCCESS] AI solved with ${aiResult.screenshotUsed ? 'VISION' : 'DOM'} analysis.`);
          
          const memory = await this.getMemory(hostname, task.currentIntent);
          const recoveryCount = (memory?.recoveryCount || 0) + 1;
          
          console.log(`[AdaptiveMemory] Learned strategy for intent: ${task.currentIntent}`);
          
          // Persist Memory
          await this.saveMemory({
            id: memory?.id || `${hostname}_${task.currentIntent}_${Date.now()}`,
            hostname,
            intent: task.currentIntent,
            successRate: 0.8,
            steps: aiResult.steps,
            updatedAt: new Date().toISOString(),
            recoveryCount,
            stable: false
          });

          // Extract and persist selectors
          const playwrightSteps = aiResult.steps.filter(s => s.strategyType === 'playwright');
          for (const step of playwrightSteps) {
            if (step.value) {
              await persistenceManager.saveSelector(`${hostname}_${task.currentIntent}`, {
                selector: step.value,
                action: step.action,
                confidence: step.confidence || 0.8
              });
            }
          }

          // Cache full workflow
          await persistenceManager.saveWorkflowCache(`${hostname}_${task.currentIntent}`, aiResult.steps);
          console.log(`[AdaptiveMemory] Saved workflow successfully to all durable layers.`);

          return true;
        } else if (!aiResult.screenshotUsed) {
          // One more try with vision if DOM execution failed
          logger('warn', `[VISION] DOM strategy failed. Retrying with visual state context...`);
          const screenshot = await page.screenshot({ type: 'png' }).then(buf => buf.toString('base64')).catch(() => undefined);
          if (screenshot) {
            const visionResult = await this.askAITeacher(page, task, logger, screenshot);
            if (visionResult && visionResult.steps) {
              logger('info', `[VISION] New strategy: ${visionResult.strategy}. Executing...`);
              let visionSuccess = true;
              for (const step of visionResult.steps) {
                const ok = await runner.runStep(step, task);
                if (!ok) { visionSuccess = false; break; }
              }
              if (visionSuccess && await runner.validateIntent(task.currentIntent, task)) {
                logger('success', `[VISION SUCCESS] Visual analysis recovered the workflow.`);
                
                const memory = await this.getMemory(hostname, task.currentIntent);
                const recoveryCount = (memory?.recoveryCount || 0) + 1;

                await this.saveMemory({
                  id: memory?.id,
                  hostname,
                  intent: task.currentIntent,
                  successRate: 0.85,
                  steps: visionResult.steps,
                  updatedAt: new Date().toISOString(),
                  recoveryCount,
                  stable: false
                });
                return true;
              }
            }
          }
        }
        
        logger('error', `[AI FAILURE] All AI strategies failed validation.`);
      }
    }

    return false;
  }

  private async askAITeacher(page: Page, task: TaskState, logger: (type: string, msg: string) => void, screenshot?: string): Promise<{ steps: WorkflowStep[], strategy?: string, screenshotUsed?: boolean } | null> {
    if (!this.planner) return null;
    try {
      const isVision = !!screenshot;
      if (!isVision) logger('info', `[AI] Analyzing DOM and visible elements...`);
      else logger('info', `[VISION] Analyzing screenshot + DOM...`);

      const domSummary = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('button, a, input, [role="button"], [class*="search" i], [class*="coupon" i]'));
        return elements.map(el => {
          const rect = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            text: el.textContent?.trim().substring(0, 50),
            aria: el.getAttribute('aria-label'),
            placeholder: el.getAttribute('placeholder'),
            path: el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ')[0]}` : null,
            isVisible: rect.width > 0 && rect.height > 0
          };
        }).filter(o => o.isVisible && (o.text || o.aria || o.placeholder)).slice(0, 50);
      });

      logger('info', `[AI] Sending context to ${this.settings.provider}...`);

      const constraints = this.getIntentConstraints(task.currentIntent);

      const prompt = `You are a web automation expert agent.
      Current Job: ${task.objective}
      Current Website: ${task.site}
      Current URL: ${page.url()}
      Current Intent: ${task.currentIntent}
      Objective Description: ${this.getObjectiveDescription(task.currentIntent, task.brand)}
      
      STRICT CONSTRAINTS FOR THIS INTENT:
      ${constraints}
      
      ${isVision ? "I have provided a SCREENSHOT of the current view. Use it to understand the visual state (e.g. if a modal/overlay is blocking, if the search input is focused, etc)." : ""}

      Your goal is to provide a sequence of instructions (WorkflowStep) to accomplish the CURRENT INTENT.
      
      DOM Fragment Summary (Visible Elements):
      ${JSON.stringify(domSummary, null, 2)}
      
      Rules:
      1. Use 'semantic' strategyType if there is clear text (e.g., 'Search').
      2. Use 'playwright' strategyType for standard CSS selectors.
      3. Action can be: click, type, scroll, wait, hover.
      4. For 'type' action, use "{{brand}}" as a placeholder for the brand name.
      5. Respond with VALID JSON ONLY.
      
      Return JSON:
      {
        "strategy": "Reasoning for your choice (visual cues + DOM)",
        "steps": [
          { "action": "click|type|scroll|wait", "strategyType": "playwright|semantic|text", "value": "value", "confidence": 0.95 }
        ]
      }`;

      const aiResult = await this.planner.plan(prompt, screenshot);
      logger('info', `[AI] Response received. Analyzing strategy...`);
      
      if (aiResult) {
        if (aiResult.strategy) logger('info', `[AI] Thought: ${aiResult.strategy}`);
        return { ...aiResult, screenshotUsed: isVision } as any;
      }
    } catch (e) {
       logger('error', `[AI ERROR] Failed to generate strategy: ${e}`);
    }
    return null;
  }

  private getIntentConstraints(intent: SemanticIntent): string {
    switch (intent) {
      case 'open_search':
        return '- ONLY click elements that likely trigger a search modal or input.\n- DO NOT type anything yet.';
      case 'type_brand':
        return '- SEARCH UI IS ALREADY OPEN (Visible or Focused).\n- ONLY use "type" or "click" on the visible search input.\n- DO NOT click search icons or triggers again, it will close the modal.';
      case 'select_brand':
        return '- Look for result highlights or store links matching the brand name.\n- Click the most relevant brand link.';
      case 'reveal_coupon':
        return '- Find buttons that say "Show Code", "Get Deal", or "Reveal".\n- DO NOT navigate away from the page.';
      default:
        return '';
    }
  }

  private getObjectiveDescription(intent: SemanticIntent, brand: string): string {
    const map: Record<string, string> = {
      'open_search': 'Find the search entry point (icon or field) to start searching.',
      'type_brand': `Enter "${brand}" into the search input field.`,
      'select_brand': `Click the correct brand link for "${brand}" from results.`,
      'verify_store_page': `Confirm we are on the dedicated page for "${brand}".`,
      'reveal_coupon': 'Find and click buttons like "Show Code" or "Get Deal" to reveal coupons.'
    };
    return map[intent] || intent;
  }
}
