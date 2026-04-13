const output = document.getElementById('output');
const loadBtn = document.getElementById('loadBtn');

loadBtn.addEventListener('click', async () => {
  const token = localStorage.getItem('token');
  if (!token) {
    output.textContent = 'No auth token found. Login first.';
    return;
  }

  try {
    const res = await fetch('/api/admin/dashboard', {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');

    output.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    output.textContent = `Error: ${error.message}`;
  }
});
