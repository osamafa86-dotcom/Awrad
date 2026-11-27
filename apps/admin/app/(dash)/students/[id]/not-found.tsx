import Link from 'next/link';

import { ar } from '@/messages/ar';

export default function StudentNotFound() {
  return (
    <div className="flex flex-col gap-12">
      <h1 className="t-display-title text-fg-primary">{ar.students.title}</h1>
      <p className="t-body-md text-fg-secondary">{ar.students.detail.notFound}</p>
      <Link href="/students" className="w-fit t-label-md text-link hover:underline">
        {ar.students.detail.back}
      </Link>
    </div>
  );
}
