import "./index.css";
import { useState, useEffect, useCallback } from "react";
import { StoreProvider } from "./store";
import { HomePage } from "./HomePage";
import { RoomPage } from "./RoomPage";

function Router() {
  const [path, setPath] = useState(window.location.pathname);

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
    (slug: string, _displayName: string) => {
      navigateTo(`/${slug}`);
      // connectToSession is called by RoomPage.useEffect to avoid double-calls
    },
    [navigateTo],
  );

  const roomSlug = path !== "/" ? path.slice(1) : null;

  if (roomSlug) {
    return <RoomPage slug={roomSlug} />;
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
