'use client';

import { useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { MainSidebar, UploadModal } from '@/components/ui';

export default function LayoutClient({ children }: { children: React.ReactNode }) {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Hide main sidebar on learn page (unless user explicitly requests it)
  const isLearnPage = pathname === '/learn';
  const showMainSidebar = searchParams.get('sidebar') === 'main';
  const hideMainSidebar = isLearnPage && !showMainSidebar;

  return (
    <>
      <div className="flex min-h-screen">
        {/* Main Sidebar - hidden on learn page */}
        {!hideMainSidebar && (
          <MainSidebar
            onUploadClick={() => setIsUploadModalOpen(true)}
            onCollapseChange={setIsSidebarCollapsed}
          />
        )}

        {/* Main Content - offset by sidebar width only when main sidebar is shown */}
        <main className={`flex-1 px-4 sm:px-6 lg:px-8 py-8 transition-all duration-300 ${
          hideMainSidebar ? '' : (isSidebarCollapsed ? 'ml-16' : 'ml-64')
        }`}>
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
