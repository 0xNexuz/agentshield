export function assertHistoricalPaymentState(record, status, expected) {
  if (record?.status !== 'SETTLED' || record.recipient !== expected.recipient ||
    record.amount_yocto !== expected.amountYocto || record.nonce !== expected.nonce ||
    record.mandate_version !== expected.mandateVersion) {
    throw new Error('Historical settled request record differs');
  }
  // The totals are cumulative. Pending payments and the current mandate may change
  // after this receipt finalized; neither can invalidate this historical settlement.
  if (BigInt(status.confirmed_total_yocto) < BigInt(record.amount_yocto)) {
    throw new Error('Current confirmed total is below the historical payment');
  }
}
