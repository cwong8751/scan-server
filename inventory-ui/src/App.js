import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [clothingItems, setClothingItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddInventoryForm, setShowAddInventoryForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // search 
  const filteredItems = clothingItems.filter(item =>
    item.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.color.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.variants?.some(v =>
      v.size.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.barcode.includes(searchTerm)
    )
  );

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

  // handle add inventory button
  function handleAddInventoryButton() {
    setShowAddInventoryForm(true);
  }

  function handleAddInventoryFormSubmit(event) {
    event.preventDefault();

    // TODO: add guard 

    const formData = new FormData(event.target);
    const data = {
      type: formData.get('clothing-type'),
      color: formData.get('color'),
      size: formData.get('clothing-size'),
      barcode: formData.get('barcode'),
      // image: formData.get('image')
    };
    console.log(data);

    // add to postgres 
    fetch('http://localhost:8080/clothing-items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
      .then(res => res.json())
      .then(newItem => {
        setClothingItems([...clothingItems, newItem]);
        setShowAddInventoryForm(false);
      })
      .catch(err => {
        setError(err.message);
      });
  }

  return (
    <>
      {
        showAddInventoryForm && (
          <dialog open>
            <article>
              <header>
                <button onClick={() => setShowAddInventoryForm(false)} aria-label="Close" rel="prev"></button>
                <h3>Add to Inventory</h3>
              </header>
              <form onSubmit={handleAddInventoryFormSubmit}>
                <select name="clothing-type" aria-label="Select clothing type" required>
                  <option defaultValue="" disabled>
                    Select clothing type...
                  </option>
                  <option>Shirt</option>
                  <option>Pants</option>
                  <option>Shoes</option>
                </select>

                <input name="color" type="text" placeholder="Color..." required />

                <select name="clothing-size" aria-label="Select clothing size" required>
                  <option defaultValue="" disabled>
                    Select clothing size...
                  </option>
                  <option>XS</option>
                  <option>S</option>
                  <option>M</option>
                  <option>L</option>
                  <option>XL</option>
                </select>

                <input name="barcode" type="text" placeholder="Barcode..." required />

                <label htmlFor="image">Image:</label>
                <input name="image" type="file" accept="image/*" />

                <input type="submit" value="Add to inventory" />
              </form>
            </article>
          </dialog>
        )
      }
      <main className="container">
        <nav>
          <ul>
            <li><strong>Inventory UI</strong></li>
          </ul>
          <ul>
            <li><button onClick={handleAddInventoryButton}>Add to inventory</button></li>
          </ul>
        </nav>
        <form onSubmit={(e) => e.preventDefault()}>
          <fieldset role="group">
            <input name="search_term" type="input" placeholder="Search..." onChange={(e) => setSearchTerm(e.target.value)} />
            <input type="submit" value="Search" />
          </fieldset>
        </form>

        {loading && <p>Loading...</p>}
        {error && <p>Error: {error}</p>}

        {!loading && !error && (
          filteredItems.length === 0
            ? <p>Nothing found.</p>
            : <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Color</th>
                  <th>Image</th>
                  <th>Size</th>
                  <th>Barcode</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => (
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
                            {v.size}<br />
                          </span>
                        ))
                        : '—'}
                    </td>

                    <td>
                      {item.variants
                        ? item.variants.map(v => (
                          <span key={v.variant_id}>
                            {v.barcode}<br />
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
      </main></>
  );
}

export default App;