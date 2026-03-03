import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

export default function InviteLanding() {
  const { inviteId } = useParams<{ inviteId: string }>();
  const [opened, setOpened] = useState(false);

  const appLink = `nexustracking://invite/${inviteId}`;

  useEffect(() => {
    // Try to open the app automatically
    window.location.href = appLink;
    const timer = setTimeout(() => setOpened(true), 1500);
    return () => clearTimeout(timer);
  }, [appLink]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Nexus Tracking</h1>
        <p style={styles.subtitle}>You've been invited to join a company</p>

        {opened && (
          <>
            <a href={appLink} style={styles.button}>
              Open in App
            </a>
            <p style={styles.hint}>
              Don't have the app? Ask your dispatcher for the download link.
            </p>
          </>
        )}

        {!opened && <p style={styles.hint}>Opening app...</p>}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
    padding: 20,
  },
  card: {
    background: "#fff",
    borderRadius: 12,
    padding: 40,
    maxWidth: 400,
    width: "100%",
    textAlign: "center",
    boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: "#1a73e8",
    margin: "0 0 8px",
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    margin: "0 0 24px",
  },
  button: {
    display: "inline-block",
    backgroundColor: "#1a73e8",
    color: "#fff",
    padding: "12px 32px",
    borderRadius: 8,
    textDecoration: "none",
    fontSize: 16,
    fontWeight: 600,
  },
  hint: {
    marginTop: 16,
    fontSize: 13,
    color: "#999",
  },
};
