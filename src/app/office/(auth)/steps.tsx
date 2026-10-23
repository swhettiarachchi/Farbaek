import { CheckIcon } from "@phosphor-icons/react/ssr";

const STEPS = ["Email code", "Authenticator", "Office"] as const;

/** Where the person is in signing in. A real sequence, so it's numbered. */
export function SignInSteps({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Signing in">
      {STEPS.map((step, i) => {
        const done = i < current;
        const here = i === current;
        return (
          <li key={step} className="flex items-center gap-2" aria-current={here ? "step" : undefined}>
            <span
              className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular ${
                done ? "bg-verified text-on-accent" : here ? "bg-primary text-on-primary" : "border border-line text-ink-3"
              }`}
            >
              {done ? <CheckIcon size={12} weight="bold" aria-label="Done" /> : i + 1}
            </span>
            <span className={here ? "font-medium text-ink" : "text-ink-3"}>{step}</span>
            {i < STEPS.length - 1 ? <span aria-hidden className="h-px w-4 bg-line sm:w-6" /> : null}
          </li>
        );
      })}
    </ol>
  );
}
