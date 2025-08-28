export default function LoadingTokens() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-label="Loading" />
      <p className="text-sm text-muted-foreground">Loading tokens from backend...</p>
    </div>
  );
}


