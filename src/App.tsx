import "./index.css";
import { useState, useEffect, useCallback } from "react";
import { StoreProvider, useStore } from "./store";
import { HomePage } from "./HomePage";

function Router() {
  const [path, setPath] = useState(window.location.pathname);
  const { connectToSession } = useStore();

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigateTo = useCallback((newPath: string) => {
    window.history.pushState(null, "", newPath);
    setPath(newPath);
  }, []);

  const handleCreateRoom = useCallback(
    (slug: string, displayName: string) => {
      navigateTo(`/${slug}`);
      connectToSession(slug, displayName);
    },
    [navigateTo, connectToSession],
  );

  const roomSlug = path !== "/" ? path.slice(1) : null;

  if (roomSlug) {
    // Room page - will be built in later stories
    return (
      <div className="container mx-auto p-8 text-center">
        <h1 className="text-3xl font-bold mb-4">Room: {roomSlug}</h1>
        <p className="text-muted-foreground">Connecting...</p>
      </div>
    );
  }

  return <HomePage onCreateRoom={handleCreateRoom} />;
}

export function App() {
  return (
    <StoreProvider>
      <Router />
    </StoreProvider>
  );
}

export default App;
