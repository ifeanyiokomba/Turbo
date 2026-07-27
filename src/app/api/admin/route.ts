import { db } from "@/lib/db";
import { json, handleError } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";
import { TxStatus, UserStatus, WalletStatus } from "@/lib/constants";

export async function GET() {
  try {
    await requirePermission(Permissions.MONITORING_VIEW);

    const [
      usersCount,
      transactionsCount,
      volumeTx,
      frozenWalletsCount,
      amlFlagsCount,
      recentUsers,
      recentTransactions,
      amlFlags,
    ] = await Promise.all([
      db.user.count(),
      db.transaction.count(),
      db.transaction.aggregate({
        _sum: { amountKobo: true },
        where: { status: TxStatus.SUCCESS },
      }),
      db.wallet.count({ where: { status: WalletStatus.FROZEN } }),
      db.amlFlag.count({ where: { resolved: false } }),
      db.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          fullName: true,
          username: true,
          email: true,
          kycTier: true,
          kycStatus: true,
          status: true,
          createdAt: true,
        },
      }),
      db.transaction.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          user: {
            select: { fullName: true, username: true },
          },
        },
      }),
      db.amlFlag.findMany({
        where: { resolved: false },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          user: {
            select: { fullName: true, username: true },
          },
        },
      }),
    ]);

    // Frozen users count (for stat tile)
    const frozenUsersCount = await db.user.count({
      where: { status: { in: [UserStatus.FROZEN, UserStatus.SUSPENDED] } },
    });

    return json({
      stats: {
        users: usersCount,
        transactions: transactionsCount,
        volume: volumeTx._sum.amountKobo ?? 0,
        frozenWallets: frozenWalletsCount,
        frozenUsers: frozenUsersCount,
        amlFlags: amlFlagsCount,
      },
      recentUsers,
      recentTransactions: recentTransactions.map((t) => ({
        id: t.id,
        reference: t.reference,
        type: t.type,
        direction: t.direction,
        amountKobo: t.amountKobo,
        status: t.status,
        createdAt: t.createdAt,
        userName: t.user?.fullName,
        userUsername: t.user?.username,
      })),
      amlFlags: amlFlags.map((f) => ({
        id: f.id,
        rule: f.rule,
        severity: f.severity,
        description: f.description,
        createdAt: f.createdAt,
        userName: f.user?.fullName,
        userUsername: f.user?.username,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
