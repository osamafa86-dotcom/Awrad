import Link from 'next/link';

import { ar } from '@/messages/ar';

export default function SessionNotFound() {
  return (
    <div className="flex flex-col gap-12">
      <h1 className="t-display-title text-fg-primary">{ar.attendance.title}</h1>
      <p className="t-body-md text-fg-secondary">{ar.attendance.detail.notFound}</p>
      <Link href="/attendance" className="w-fit t-label-md text-link hover:underline">
        {ar.attendance.detail.back}
      </Link>
    </div>
  );
}
