import Link from "next/link";
import Image from "next/image";

export default function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 select-none">
      <Image src="/logo.svg" alt="KRChange" width={28} height={28} priority className="w-6 h-6 md:w-7 md:h-7" />
      <span className="hidden md:inline text-xl font-semibold tracking-tight">
        KR<span className="text-primary">Change</span>
      </span>
    </Link>
  );
}


