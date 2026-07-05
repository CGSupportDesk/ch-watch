import Image from "next/image";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ArrowRight, LockKeyhole, ShieldAlert } from "lucide-react";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

type LoginProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginProps) {
  const params = (await searchParams) || {};
  const next = safeNext(single(params.next));
  const hasError = single(params.error) === "1";
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value || "");
  if (session) redirect(next);

  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f5f7] px-4 py-10 text-[#1d1d1f]">
      <section className="w-full max-w-md rounded-[20px] border border-black/10 bg-white p-6 shadow-[0_20px_80px_rgba(0,0,0,0.08)]">
        <div className="flex items-center gap-3">
          <Image alt="CH Watch" className="h-12 w-12" height="48" src="/brand-mark.svg" width="48" />
          <div>
            <p className="text-sm font-semibold text-[#6e6e73]">Closing Gap Compliance</p>
            <h1 className="text-2xl font-semibold">Sign in to CH Watch</h1>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-[#007aff]/20 bg-[#f4f9ff] p-4 text-sm text-[#305f91]">
          <div className="flex gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Use the same dashboard username and password. Your session lasts for 12 hours.</p>
          </div>
        </div>

        {hasError ? (
          <div className="mt-4 rounded-xl border border-[#ff3b30]/20 bg-[#fff2f0] p-3 text-sm font-medium text-[#b42318]">
            The username or password was not correct.
          </div>
        ) : null}

        <form action="/api/auth/login" className="mt-6 flex flex-col gap-4" method="post">
          <input name="next" type="hidden" value={next} />
          <label className="flex flex-col gap-2 text-sm font-semibold">
            Username
            <input
              autoComplete="username"
              autoFocus
              className="h-11 rounded-xl border border-black/10 bg-[#fbfbfd] px-3 text-base font-medium outline-none transition focus:border-[#007aff] focus:bg-white focus:ring-4 focus:ring-[#007aff]/10"
              name="username"
              required
              type="text"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            Password
            <input
              autoComplete="current-password"
              className="h-11 rounded-xl border border-black/10 bg-[#fbfbfd] px-3 text-base font-medium outline-none transition focus:border-[#007aff] focus:bg-white focus:ring-4 focus:ring-[#007aff]/10"
              name="password"
              required
              type="password"
            />
          </label>
          <button className="mt-2 flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1d1d1f] px-4 text-sm font-semibold text-white transition hover:bg-black focus:outline-none focus:ring-4 focus:ring-black/15">
            <LockKeyhole className="h-4 w-4" />
            Sign in
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </section>
    </main>
  );
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeNext(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
