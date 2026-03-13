import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [clothingItems, setClothingItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('http://localhost:8080/clothing-items')
      .then(res => res.json())
      .then(data => {
        setClothingItems(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <main className="container">
      <h1>Inventory UI</h1>
      <form>
        <fieldset role="group">
          <input name="search_term" type="input" placeholder="Search..." />
          <input type="submit" value="Search" />
        </fieldset>
      </form>

      {loading && <p>Loading...</p>}
      {error && <p>Error: {error}</p>}

      {!loading && !error && (
        clothingItems.length === 0
          ? <p>Nothing in database.</p>
          : <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Color</th>
                  <th>Image</th>
                  <th>Variants</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {clothingItems.map(item => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.type}</td>
                    <td>{item.color}</td>
                    <td>
                      {item.image_url
                        ? <img src={item.image_url} alt={item.type} width={60} />
                        : '—'}
                    </td>
                    <td>
                      {item.variants
                        ? item.variants.map(v => (
                            <span key={v.variant_id}>
                              {v.size} · {v.barcode}<br />
                            </span>
                          ))
                        : '—'}
                    </td>
                    <td>{new Date(item.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
      )}

      <h2>Server information</h2>
      <b>Server address</b>
    </main>
  );
}

export default App;