import { BrowserRouter, Route, Routes } from "react-router-dom";
import Header from "@/components/Header";
import SessionsPage from "@/pages/SessionsPage";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background">
        <Header />
        <main>
          <Routes>
            <Route path="/" element={<SessionsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
