'use client';

import { useState, useEffect } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { MainSidebar, UploadModal, BackgroundTasksBanner } from '@/components/ui';

export default function LayoutClient({ children }: { children: React.ReactNode }) {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Check launch mode - redirect to landing page if in pre-launch mode
  const launchMode = process.env.NEXT_PUBLIC_LAUNCH_MODE || 'app';
  const isLandingMode = launchMode === 'landing';

  useEffect(() => {
    // If in landing mode and not on homepage, redirect to homepage
    if (isLandingMode && pathname !== '/') {
      router.push('/');
    }
  }, [isLandingMode, pathname, router]);

  // Hide main sidebar on learn page (unless user explicitly requests it)
  const isLearnPage = pathname === '/learn';
  const showMainSidebar = searchParams.get('sidebar') === 'main';
  const hideMainSidebar = isLearnPage && !showMainSidebar;

  // If in landing mode, render children without sidebar/layout
  // (user will be redirected to homepage by the useEffect above)
  if (isLandingMode) {
    return <>{children}</>;
  }

  return (
    <>
      {/* Background Tasks Banner */}
      <BackgroundTasksBanner />

      <div className="flex min-h-screen pt-8">
        {/* Main Sidebar - hidden on learn page */}
        {!hideMainSidebar && (
          <MainSidebar
            onUploadClick={() => setIsUploadModalOpen(true)}
            onCollapseChange={setIsSidebarCollapsed}
          />
        )}

        {/* Main Content - learn page handles its own margin, other pages use sidebar margin */}
        <main className={`flex-1 px-4 sm:px-6 lg:px-8 py-8 ${
          isLearnPage ? '' : (hideMainSidebar ? '' : (isSidebarCollapsed ? 'ml-16 transition-all duration-300' : 'ml-64 transition-all duration-300'))
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
