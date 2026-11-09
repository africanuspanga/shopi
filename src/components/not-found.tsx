import { Wordmark } from '#/components/ui'

/** A page that isn't there: says what happened and offers one way forward. */
export function NotFound({ title, body, href = '/', action = 'Go to RIZK' }: { title: string; body: string; href?: string; action?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-page px-6 text-center">
      <a href="/" aria-label="RIZK" className="mb-10">
        <Wordmark className="h-[16px] w-auto" />
      </a>
      <p className="code text-[13px] text-muted">404</p>
      <h1 className="title mt-3 text-[30px]">{title}</h1>
      <p className="mt-2 max-w-[34ch] text-[15px] leading-relaxed text-muted">{body}</p>
      <a href={href} className="btn mt-8">
        {action}
      </a>
    </div>
  )
}
