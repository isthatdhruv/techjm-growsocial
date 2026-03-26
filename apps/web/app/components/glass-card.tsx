export function GlassCard({
  children,
  className = '',
  hover = false,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={`glass rounded-2xl ${hover ? 'glass-hover transition-all duration-300' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
