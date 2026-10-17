type Principal = { actor_id: string; display_name?: string | null; email?: string | null }

/** 给人看的名字：显示名，没有就邮箱，再没有才是账号编号。 */
export function signedInName(user: Principal): string {
  return user.display_name || user.email || user.actor_id
}

// 页头里写着登录的是谁，鼠标停上去看邮箱（所有者 2026-10-17「现在登录了不知道是谁」）
export function SignedInAs({ label, email }: { label: string; email?: string | null }) {
  return (
    <span className="text-muted-foreground max-w-64 truncate text-sm" title={email ?? undefined}>
      {label}
    </span>
  )
}
