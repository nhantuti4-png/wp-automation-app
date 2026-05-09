import { TaskState, SemanticIntent } from '../types.ts';

export class TaskStateEngine {
  private state: TaskState;
  private flow: SemanticIntent[] = [
    'open_search',
    'type_brand',
    'select_brand',
    'verify_store_page',
    'reveal_coupon'
  ];

  constructor(site: string, brand: string) {
    this.state = {
      site,
      brand,
      currentIntent: 'open_search',
      completedIntents: [],
      objective: 'Search and find coupons for brand ' + brand,
      failCount: 0,
      startedAt: Date.now(),
      status: 'idle'
    };
  }

  getState() {
    return this.state;
  }

  next() {
    const currentIndex = this.flow.indexOf(this.state.currentIntent);
    if (currentIndex < this.flow.length - 1) {
      this.state.completedIntents.push(this.state.currentIntent);
      this.state.currentIntent = this.flow[currentIndex + 1];
      return true;
    }
    this.state.status = 'success';
    return false;
  }

  fail(reason: string) {
    this.state.failCount++;
    if (this.state.failCount > 3) {
      this.state.status = 'failed';
    }
  }

  isDone() {
    return this.state.status === 'success' || this.state.status === 'failed';
  }

  getCurrentObjective(): string {
    const objectives: Record<string, string> = {
      'open_search': 'Find the search UI that allows searching stores or brands.',
      'type_brand': `Enter the brand name "${this.state.brand}" into the search input.`,
      'select_brand': `Select the correct brand "${this.state.brand}" from search results or dropdown.`,
      'verify_store_page': `Verify we are on the official store page for "${this.state.brand}".`,
      'reveal_coupon': 'Find and reveal valid coupon codes on the page.'
    };
    return objectives[this.state.currentIntent] || 'Complete current task';
  }
}
