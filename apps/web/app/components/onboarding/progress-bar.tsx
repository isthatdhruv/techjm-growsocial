'use client';

const steps = [
  { num: 1, label: 'Signup' },
  { num: 2, label: 'Niche' },
  { num: 3, label: 'AI Keys' },
  { num: 4, label: 'Socials' },
  { num: 5, label: 'Review' },
];

export function ProgressBar({
  currentStep,
  completedSteps,
}: {
  currentStep: number;
  completedSteps: number[];
}) {
  return (
    <div className="flex items-center justify-center gap-0 px-4 py-4">
      {steps.map((step, i) => {
        const isCompleted = completedSteps.includes(step.num);
        const isCurrent = step.num === currentStep;
        return (
          <div key={step.num} className="flex items-center">
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all ${
                  isCompleted
                    ? 'border-accent bg-accent text-white'
                    : isCurrent
                      ? 'border-blue bg-blue text-white animate-pulse'
                      : 'border-white/20 bg-transparent text-text-muted'
                }`}
              >
                {isCompleted ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  step.num
                )}
              </div>
              <span
                className={`mt-1.5 text-[11px] font-medium ${
                  isCompleted
                    ? 'text-accent'
                    : isCurrent
                      ? 'text-white'
                      : 'text-text-muted/60'
                } hidden sm:block`}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {i < steps.length - 1 && (
              <div
                className={`mx-2 h-0.5 w-8 sm:w-14 ${
                  isCompleted ? 'bg-accent' : 'border-t border-dashed border-white/20'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
