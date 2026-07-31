'use strict';

const { timelineMessages } = require('./matrixClient');

class SyncState {
  constructor() {
    this.nextBatch = '';
    this.initialized = false;
  }

  since() {
    return this.nextBatch;
  }

  accept(sync, botUserId) {
    if (sync.next_batch) this.nextBatch = sync.next_batch;
    if (!this.initialized) {
      this.initialized = true;
      return [];
    }
    return timelineMessages(sync, botUserId);
  }
}

module.exports = { SyncState };
