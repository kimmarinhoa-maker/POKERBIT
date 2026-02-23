interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'primary' | 'white';
  className?: string;
}

const sizeMap = {
  xs: 'h-3 w-3 border-2',
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-[3px]',
  lg: 'h-8 w-8 border-4',
  xl: 'h-10 w-10 border-4',
};

const variantMap = {
  primary: 'border-poker-500 border-t-transparent',
  white: 'border-white/30 border-t-white',
};

export default function Spinner({ size = 'lg', variant = 'primary', className = '' }: SpinnerProps) {
  return (
    <div
      className={`animate-spin rounded-full ${sizeMap[size]} ${variantMap[variant]} ${className}`}
      role="status"
      aria-label="Carregando"
    />
  );
}
