import { Worker } from 'near-workspaces';

const worker = await Worker.init();
try {
  const block = await worker.provider.block({ finality: 'final' });
  console.log(JSON.stringify({
    rootAccountId: worker.rootAccount.accountId,
    blockHeight: block.header.height,
    timestampNanosec: block.header.timestamp_nanosec,
  }));
} finally {
  await worker.tearDown();
}
