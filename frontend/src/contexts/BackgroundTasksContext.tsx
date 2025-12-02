'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

export type TaskStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type BackgroundTask = {
  id: string;
  type: 'upload' | 'lesson' | 'extraction';
  title: string;
  subtitle?: string; // Optional subtitle for additional context (e.g., document name)
  status: TaskStatus;
  progress: number; // 0-100
  courseId?: string;
  documentId?: string;
  sectionId?: string; // Section ID for lesson generation tasks
  error?: string;
  startedAt: string;
  completedAt?: string;
};

type BackgroundTasksContextType = {
  tasks: BackgroundTask[];
  addTask: (task: Omit<BackgroundTask, 'startedAt'>) => void;
  updateTask: (id: string, updates: Partial<BackgroundTask>) => void;
  removeTask: (id: string) => void;
  clearCompleted: () => void;
  activeTasks: BackgroundTask[];
  completedTasks: BackgroundTask[];
  failedTasks: BackgroundTask[];
};

const BackgroundTasksContext = createContext<BackgroundTasksContextType | undefined>(undefined);

export function BackgroundTasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);

  // Auto-remove completed tasks after 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTasks(prev => {
        const now = Date.now();
        return prev.filter(task => {
          if (task.status === 'completed' && task.completedAt) {
            const completedTime = new Date(task.completedAt).getTime();
            const elapsed = now - completedTime;
            return elapsed < 10000; // Keep for 10 seconds
          }
          return true;
        });
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const addTask = useCallback((task: Omit<BackgroundTask, 'startedAt'>) => {
    setTasks(prev => [...prev, { ...task, startedAt: new Date().toISOString() }]);
  }, []);

  const updateTask = useCallback((id: string, updates: Partial<BackgroundTask>) => {
    setTasks(prev => prev.map(task =>
      task.id === id ? { ...task, ...updates } : task
    ));
  }, []);

  const removeTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(task => task.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setTasks(prev => prev.filter(task => task.status !== 'completed'));
  }, []);

  const activeTasks = tasks.filter(t => t.status === 'queued' || t.status === 'processing');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const failedTasks = tasks.filter(t => t.status === 'failed');

  return (
    <BackgroundTasksContext.Provider value={{
      tasks,
      addTask,
      updateTask,
      removeTask,
      clearCompleted,
      activeTasks,
      completedTasks,
      failedTasks
    }}>
      {children}
    </BackgroundTasksContext.Provider>
  );
}

export function useBackgroundTasks() {
  const context = useContext(BackgroundTasksContext);
  if (!context) {
    throw new Error('useBackgroundTasks must be used within BackgroundTasksProvider');
  }
  return context;
}
