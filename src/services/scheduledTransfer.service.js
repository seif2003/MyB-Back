const prisma = require('../db/prisma');
const env = require('../config/env');
const { recordAudit } = require('./audit.service');
const { createNotification } = require('./notification.service');

const BATCH_SIZE = 25;

let intervalHandle = null;
let running = false;

const processScheduledTransfer = async (scheduled) => {
  const now = new Date();

  if (!scheduled.fromAccount || scheduled.fromAccount.status !== 'ACTIVE') {
    await prisma.scheduledTransfer.update({
      where: { id: scheduled.id },
      data: { status: 'REJECTED' }
    });

    await createNotification({
      userId: scheduled.userId,
      type: 'WARNING',
      title: 'Scheduled transfer rejected',
      message: 'Your scheduled transfer was rejected because the source account is not active.'
    });
    return;
  }

  if (!scheduled.beneficiary || scheduled.beneficiary.userId !== scheduled.userId) {
    await prisma.scheduledTransfer.update({
      where: { id: scheduled.id },
      data: { status: 'REJECTED' }
    });

    await createNotification({
      userId: scheduled.userId,
      type: 'WARNING',
      title: 'Scheduled transfer rejected',
      message: 'Your scheduled transfer was rejected because the beneficiary is invalid.'
    });
    return;
  }

  const account = await prisma.account.findUnique({ where: { id: scheduled.fromAccountId } });
  if (!account || Number(account.balance) < Number(scheduled.amount)) {
    await prisma.scheduledTransfer.update({
      where: { id: scheduled.id },
      data: { status: 'REJECTED' }
    });

    await createNotification({
      userId: scheduled.userId,
      type: 'WARNING',
      title: 'Scheduled transfer rejected',
      message: 'Your scheduled transfer was rejected because of insufficient funds.'
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.transfer.create({
      data: {
        fromAccountId: scheduled.fromAccountId,
        beneficiaryId: scheduled.beneficiaryId,
        externalName: scheduled.beneficiary.name,
        externalIban: scheduled.beneficiary.iban,
        amount: scheduled.amount,
        currency: scheduled.currency,
        status: 'PENDING',
        scheduledAt: scheduled.scheduledAt
      }
    });

    await tx.scheduledTransfer.update({
      where: { id: scheduled.id },
      data: {
        status: 'COMPLETED'
      }
    });
  });

  await recordAudit({
    userId: scheduled.userId,
    action: 'transfer.scheduled.enqueued',
    entity: 'ScheduledTransfer',
    entityId: scheduled.id,
    metadata: {
      scheduledAt: scheduled.scheduledAt.toISOString(),
      processedAt: now.toISOString()
    }
  });

  await createNotification({
    userId: scheduled.userId,
    type: 'INFO',
    title: 'Scheduled transfer queued',
    message: `Your scheduled transfer of ${Number(scheduled.amount)} ${
      scheduled.currency
    } was queued for validation.`
  });
};

const processDueScheduledTransfers = async () => {
  if (running) {
    return;
  }

  running = true;
  try {
    const due = await prisma.scheduledTransfer.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: new Date() }
      },
      include: {
        fromAccount: true,
        beneficiary: true
      },
      orderBy: { scheduledAt: 'asc' },
      take: BATCH_SIZE
    });

    for (const scheduled of due) {
      await processScheduledTransfer(scheduled);
    }
  } finally {
    running = false;
  }
};

const startScheduledTransferProcessor = () => {
  if (intervalHandle) {
    return () => undefined;
  }

  const pollMs = Math.max(5000, env.scheduledTransferPollMs);
  intervalHandle = setInterval(() => {
    processDueScheduledTransfers().catch((err) => {
      console.error('Scheduled transfer processor error:', err.message);
    });
  }, pollMs);

  return () => {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  };
};

module.exports = {
  startScheduledTransferProcessor,
  processDueScheduledTransfers
};
