export default function NotFound() {
  return (
    <html>
      <body>
        <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '3rem', fontWeight: 'bold' }}>404</h1>
            <p style={{ marginTop: '0.5rem', color: '#666' }}>Page not found</p>
            <a href="/" style={{ marginTop: '1rem', display: 'inline-block', color: '#0070f3' }}>
              Back to Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
