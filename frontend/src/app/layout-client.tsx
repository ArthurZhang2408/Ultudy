'use client';

import { useState } from 'react';
import { MainSidebar, UploadModal } from '@/components/ui';

export default function LayoutClient({ children }: { children: React.ReactNode }) {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  return (
    <>
      <div className="flex min-h-screen">
        {/* Main Sidebar */}
        <MainSidebar onUploadClick={() => setIsUploadModalOpen(true)} />

        {/* Main Content - offset by sidebar width */}
        <main className="flex-1 ml-64 px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </div>

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
      />
    </>
  );
}
