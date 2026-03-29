import { BrowserRouter, Route, Routes } from "react-router-dom";
import Header from "@/components/Header";
import SessionsPage from "@/pages/SessionsPage";
import { Toaster } from "@/components/ui/sonner";
import { getDesktopPlatform, isTauriShell } from "@/lib/runtime";

export default function App() {
  const showHeader = !isTauriShell() || getDesktopPlatform() !== "macos";

  return (
    <BrowserRouter>
      <div className="flex h-screen flex-col bg-background">
        {showHeader && <Header />}
        <main className="scrollbar-hidden flex flex-1 flex-col overflow-y-auto">
          <Routes>
            <Route path="/" element={<SessionsPage />} />
          </Routes>
        </main>
      </div>
      <Toaster />
    </BrowserRouter>
  );
}
