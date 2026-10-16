import { describe, expect, it } from "vitest";
import { findAuthUserByEmail } from "./authUsers";

function admin(total: number, pageSize: number) {
  const calls: number[] = [];
  const users = Array.from({ length: total }, (_, i) => ({ id: `u${i}`, email: `user${i}@example.com` }));
  return {
    calls,
    client: {
      auth: {
        admin: {
          listUsers: async ({ page, perPage }: { page: number; perPage: number }) => {
            calls.push(page);
            const start = (page - 1) * perPage;
            return { data: { users: users.slice(start, start + perPage) }, error: null };
          },
        },
      },
    } as never,
    pageSize,
  };
}

describe("findAuthUserByEmail", () => {
  it("finds a user beyond the first page", async () => {
    const a = admin(2500, 1000);
    const u = await findAuthUserByEmail(a.client, "USER2400@example.com", { perPage: 1000 });
    expect(u?.id).toBe("u2400");
    expect(a.calls).toEqual([1, 2, 3]);
  });

  it("stops at the last page when there is no match", async () => {
    const a = admin(1500, 1000);
    expect(await findAuthUserByEmail(a.client, "nobody@example.com", { perPage: 1000 })).toBeNull();
    expect(a.calls).toEqual([1, 2]);
  });

  it("stops after the first page when it already matches", async () => {
    const a = admin(2500, 1000);
    expect((await findAuthUserByEmail(a.client, "user3@example.com"))?.id).toBe("u3");
    expect(a.calls).toEqual([1]);
  });
});
