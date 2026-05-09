import { Page, Locator } from 'playwright';
import { WorkflowStep, WorkflowMemory, SemanticIntent, TaskState } from '../types.ts';

export class StrategyRunner {
  private page: Page;
  private logger: (type: string, msg: string) => void;

  constructor(page: Page, logger: (type: string, msg: string) => void) {
    this.page = page;
    this.logger = logger;
  }

  private random(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  async runStep(step: WorkflowStep, task: TaskState): Promise<boolean> {
    this.logger('info', `[RUNNER] Executing ${step.action} via ${step.strategyType}: ${step.value}`);
    
    try {
      let locator: Locator;
      
      if (step.strategyType === 'playwright') {
        locator = this.page.locator(step.value).first();
      } else if (step.strategyType === 'semantic') {
        // Try common semantic patterns
        const patterns = [
          step.value,
          `button:has-text("${step.value}")`,
          `a:has-text("${step.value}")`,
          `input[placeholder*="${step.value}" i]`,
          `input[aria-label*="${step.value}" i]`,
          `[role="button"]:has-text("${step.value}")`
        ];
        
        let found = false;
        for (const p of patterns) {
          try {
            locator = this.page.locator(p).first();
            if (await locator.isVisible({ timeout: 500 })) {
              found = true;
              break;
            }
          } catch(e) {}
        }
        
        if (!found) {
           locator = this.page.getByText(step.value, { exact: false }).first();
        }
      } else if (step.strategyType === 'text') {
        locator = this.page.getByText(step.value, { exact: false }).first();
      } else {
        return false;
      }

      const isVisible = await locator.isVisible({ timeout: 2000 }).catch(() => false);
      if (!isVisible) return false;

      switch (step.action) {
        case 'click':
          await locator.click({ delay: this.random(50, 150) });
          break;
        case 'type':
          const textToType = step.text?.replace('{{brand}}', task.brand) || task.brand;
          await locator.click();
          await locator.focus();
          await this.page.keyboard.press('Control+A');
          await this.page.keyboard.press('Backspace');
          await this.page.keyboard.type(textToType, { delay: this.random(80, 160) });
          // Force UI updates
          await locator.dispatchEvent('input');
          await locator.dispatchEvent('change');
          // Some sites need Enter
          if (step.value.includes('search')) {
            await this.page.keyboard.press('Enter');
          }
          break;
        case 'hover':
          await locator.hover();
          break;
        case 'scroll':
          await locator.scrollIntoViewIfNeeded();
          break;
        case 'wait':
          await this.page.waitForTimeout(parseInt(step.value) || 1000);
          break;
      }

      return true;
    } catch (e) {
      this.logger('warn', `[RUNNER] Step failed: ${step.value}`);
      return false;
    }
  }

  /**
   * Checks if the UI is already in a state where the intent is "ready" for the next operation.
   * e.g. for type_brand, if the search input is already visible.
   */
  async checkFastPath(intent: SemanticIntent, task: TaskState): Promise<boolean> {
    switch (intent) {
      case 'open_search':
        // If search input is already visible, intent is already "passed" or "unnecessary"
        const input = this.page.locator('input[type="search"], input[placeholder*="search" i]').first();
        if (await input.isVisible({ timeout: 500 }).catch(() => false)) {
          this.logger('info', '[FAST PATH] Search input already visible. Skipping open_search.');
          return true;
        }
        break;
      case 'type_brand':
        const searchInput = this.page.locator('input[type="search"], input[placeholder*="search" i]').first();
        if (await searchInput.isVisible({ timeout: 500 }).catch(() => false)) {
           this.logger('info', `[FAST PATH] Typing "${task.brand}" directly into visible search input.`);
           await searchInput.fill(task.brand);
           await this.page.keyboard.press('Enter');
           return true; 
        }
        break;
      case 'reveal_coupon':
         // If coupons are already visible, fast path success
         const codes = this.page.locator('[class*="code" i], .coupon-code, .reveal-code').first();
         if (await codes.isVisible({ timeout: 500 }).catch(() => false)) {
            this.logger('info', '[FAST PATH] Coupon codes already visible.');
            return true;
         }
         break;
    }
    return false;
  }

  async validateIntent(intent: SemanticIntent, task: TaskState): Promise<boolean> {
    const isVisible = async (sel: string) => await this.page.locator(sel).first().isVisible({ timeout: 3000 }).catch(() => false);
    
    switch (intent) {
      case 'open_search':
        // Success if search input or modal is visible
        return await isVisible('input[type="search"], input[placeholder*="search" i], [class*="search-modal" i], [class*="search-overlay" i], .search-modal');
      
      case 'type_brand':
        // Success if the search input contains the brand name or something changed
        const input = this.page.locator('input[type="search"], input[placeholder*="search" i]').first();
        const val = await input.inputValue().catch(() => '');
        return val.toLowerCase().includes(task.brand.substring(0, 3).toLowerCase()) || !!val;
      
      case 'select_brand':
      case 'verify_store_page':
        // Success if URL changed or title includes brand
        await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        const title = await this.page.title();
        const url = this.page.url();
        const brandMatch = task.brand.toLowerCase().replace(/\s+/g, '-');
        return title.toLowerCase().includes(task.brand.toLowerCase()) || url.toLowerCase().includes(brandMatch);
      
      case 'reveal_coupon':
        // Success if a code or modal appeared
        return await isVisible('[class*="copy" i], [class*="coupon-code" i], .code-text, [class*="reveal" i]');
      
      default:
        return true;
    }
  }
}
