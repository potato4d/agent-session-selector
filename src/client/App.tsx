import { BrowserRouter, Route, Routes } from "react-router-dom";
import Header from "@/components/Header";
import SessionsPage from "@/pages/SessionsPage";
import { Toaster } from "@/components/ui/sonner";

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen flex-col bg-background">
        <Header />
        <main className="flex flex-1 flex-col overflow-hidden">
          <Routes>
            <Route path="/" element={<SessionsPage />} />
          </Routes>
        </main>
      </div>
      <Toaster />
    </BrowserRouter>
  );
}
