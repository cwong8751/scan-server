import { useState, useEffect } from 'react';
import './App.css';

// ─── Barcode parser (mirrors backend logic) ───────────────────────────────────
function parseBarcode(barcode) {
  if (!barcode || barcode.length < 7) return null;
  if (barcode[3].toUpperCase() !== 'D') return null;
  const afterMarker = barcode.slice(4);
  const size = afterMarker.slice(0, -2).toUpperCase();
  const unit = parseInt(afterMarker.slice(-2), 10);
  if (!size || isNaN(unit)) return null;
  return {
    prefix:       barcode.slice(0, 3).toUpperCase(),
    type_code:    barcode[0].toUpperCase(),
    style_code:   barcode[1].toUpperCase(),
    texture_code: barcode[2].toUpperCase(),
    size,
    unit_number: unit
  };
}

export default function App() {
  const [clothingItems, setClothingItems] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [searchTerm, setSearchTerm]       = useState('');

  // Add form state
  const [showAddForm, setShowAddForm]           = useState(false);
  const [addBarcode, setAddBarcode]             = useState('');
  const [addParsed, setAddParsed]               = useState(null);       // parsed barcode
  const [prefixExists, setPrefixExists]         = useState(null);       // null=unchecked
  const [prefixCheckLoading, setPrefixCheckLoading] = useState(false);

  // Delete form state
  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [deletingUnit, setDeletingUnit]     = useState(null);           // single unit { id, barcode }

  // Sale form state
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [saleItem, setSaleItem]         = useState(null);               // { prefix, size }

  // ─── Filtering ──────────────────────────────────────────────────────────────
  const filteredItems = clothingItems.filter(item =>
    item.prefix.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.type_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.sizes?.some(s =>
      s.size.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.units?.some(u => u.barcode.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  );

  // ─── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('http://localhost:8080/clothing-items')
      .then(res => res.json())
      .then(data => { setClothingItems(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  // ─── Barcode input handler — parse + prefix check ───────────────────────────
  function handleBarcodeChange(e) {
    const val = e.target.value.toUpperCase();
    setAddBarcode(val);
    setPrefixExists(null);

    const parsed = parseBarcode(val);
    setAddParsed(parsed);

    if (parsed) {
      setPrefixCheckLoading(true);
      fetch(`http://localhost:8080/prefix-check/${parsed.prefix}`)
        .then(res => res.json())
        .then(data => { setPrefixExists(data.exists); setPrefixCheckLoading(false); })
        .catch(() => { setPrefixCheckLoading(false); });
    }
  }

  function handleAddFormClose() {
    setShowAddForm(false);
    setAddBarcode('');
    setAddParsed(null);
    setPrefixExists(null);
  }

  // ─── Add form submit ─────────────────────────────────────────────────────────
  function handleAddFormSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    formData.set('barcode', addBarcode);

    fetch('http://localhost:8080/scan', { method: 'POST', body: formData })
      .then(res => res.json())
      .then(newUnit => {
        if (newUnit.error) { setError(newUnit.error); return; }
        // Reload the full list so grouping stays correct
        return fetch('http://localhost:8080/clothing-items')
          .then(res => res.json())
          .then(data => { setClothingItems(data); handleAddFormClose(); });
      })
      .catch(err => setError(err.message));
  }

  // ─── Delete ──────────────────────────────────────────────────────────────────
  function handleDeleteSubmit(e) {
    e.preventDefault();
    fetch(`http://localhost:8080/clothing-items/${deletingUnit.id}`, { method: 'DELETE' })
      .then(res => res.json())
      .then(() => {
        return fetch('http://localhost:8080/clothing-items')
          .then(res => res.json())
          .then(data => { setClothingItems(data); setShowDeleteForm(false); });
      })
      .catch(err => setError(err.message));
  }

  // ─── Sale ────────────────────────────────────────────────────────────────────
  function handleSaleSubmit(e) {
    e.preventDefault();
    // TODO: wire up to a sales endpoint
    setShowSaleForm(false);
  }

  return (
    <>
      {/* ── Add form ── */}
      {showAddForm && (
        <dialog open>
          <article>
            <header>
              <button onClick={handleAddFormClose} aria-label="Close" rel="prev" />
              <h3>Scan New Item</h3>
            </header>
            <form onSubmit={handleAddFormSubmit}>

              <input
                name="barcode"
                type="text"
                placeholder="Scan or type barcode... (e.g. ABCDM28)"
                value={addBarcode}
                onChange={handleBarcodeChange}
                required
              />

              {/* Live barcode feedback */}
              {addBarcode && !addParsed && (
                <small style={{ color: 'red' }}>
                  Invalid barcode format. Expected e.g. ABCDM01 or ABCDXL12.
                </small>
              )}
              {addParsed && (
                <small style={{ color: 'green' }}>
                  ✓ Prefix: {addParsed.prefix} &nbsp;|&nbsp;
                  Size: {addParsed.size} &nbsp;|&nbsp;
                  Unit: {String(addParsed.unit_number).padStart(2, '0')}
                </small>
              )}

              {/* Image upload — only shown when prefix is new */}
              {prefixCheckLoading && <small>Checking prefix...</small>}
              {addParsed && prefixExists === false && (
                <>
                  <small style={{ color: 'orange' }}>
                    ⚠ New clothing prefix "{addParsed.prefix}" — please attach an image.
                  </small>
                  <label htmlFor="image">Image:</label>
                  <input name="image" type="file" accept="image/*" required />
                </>
              )}
              {addParsed && prefixExists === true && (
                <small style={{ color: 'grey' }}>
                  Existing prefix "{addParsed.prefix}" — image already on file.
                </small>
              )}

              <input
                type="submit"
                value="Add to Inventory"
                disabled={!addParsed || prefixExists === null}
              />
            </form>
          </article>
        </dialog>
      )}

      {/* ── Delete confirmation ── */}
      {showDeleteForm && deletingUnit && (
        <dialog open>
          <article>
            <header>
              <button onClick={() => setShowDeleteForm(false)} aria-label="Close" rel="prev" />
              <h3>Delete Unit</h3>
            </header>
            <form onSubmit={handleDeleteSubmit}>
              <p>You are removing unit <strong>{deletingUnit.barcode}</strong> from inventory.</p>
              <p>Are you sure?</p>
              <input className="contrast" type="submit" value="Delete" />
            </form>
          </article>
        </dialog>
      )}

      {/* ── Sale form ── */}
      {showSaleForm && saleItem && (
        <dialog open>
          <article>
            <header>
              <button onClick={() => setShowSaleForm(false)} aria-label="Close" rel="prev" />
              <h3>Make Sale</h3>
            </header>
            <form onSubmit={handleSaleSubmit}>
              <p>
                Selling: <strong>{saleItem.prefix}</strong> — Size <strong>{saleItem.size}</strong>
                &nbsp;({saleItem.count} unit{saleItem.count !== 1 ? 's' : ''} available)
              </p>
              <input type="number" name="quantity" placeholder="Quantity..." min={1} max={saleItem.count} required />
              <input type="number" name="price" placeholder="Price..." required />
              <input type="submit" value="Make Sale" />
            </form>
          </article>
        </dialog>
      )}

      {/* ── Main layout ── */}
      <main className="container">
        <nav>
          <ul><li><strong>Inventory UI</strong></li></ul>
          <ul><li><button onClick={() => setShowAddForm(true)}>Add to Inventory</button></li></ul>
        </nav>

        <form onSubmit={e => e.preventDefault()}>
          <fieldset role="group">
            <input
              name="search_term"
              type="text"
              placeholder="Search by prefix, type code, size, or barcode..."
              onChange={e => setSearchTerm(e.target.value)}
            />
            <input type="submit" value="Search" />
          </fieldset>
        </form>

        {loading && <p>Loading...</p>}
        {error   && <p style={{ color: 'red' }}>Error: {error}</p>}

        {!loading && !error && (
          filteredItems.length === 0
            ? <p>Nothing found.</p>
            : <table>
                <thead>
                  <tr>
                    <th>Prefix</th>
                    <th>Type</th>
                    <th>Style</th>
                    <th>Texture</th>
                    <th>Image</th>
                    <th>Size</th>
                    <th>Units</th>
                    <th>Barcodes</th>
                    <th>First Added</th>
                    <th>Delete Unit</th>
                    <th>Sale</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.flatMap(item =>
                    item.sizes.map(sizeGroup => (
                      <tr key={`${item.prefix}-${sizeGroup.size}`}>
                        <td>{item.prefix}</td>
                        <td>{item.type_code}</td>
                        <td>{item.style_code}</td>
                        <td>{item.texture_code}</td>
                        <td>
                          {item.image_url
                            ? <img src={`http://localhost:8080${item.image_url}`} alt={item.prefix} width={60} />
                            : '—'}
                        </td>
                        <td>{sizeGroup.size}</td>
                        <td>{sizeGroup.count}</td>
                        <td style={{ fontSize: '0.8em' }}>
                          {sizeGroup.units.map(u => u.barcode).join(', ')}
                        </td>
                        <td>
                          {new Date(sizeGroup.units[0].created_at).toLocaleDateString()}
                        </td>
                        <td>
                          {/* Delete the most recently added unit in this size group */}
                          <button
                            className="contrast"
                            onClick={() => {
                              const lastUnit = sizeGroup.units[sizeGroup.units.length - 1];
                              setDeletingUnit(lastUnit);
                              setShowDeleteForm(true);
                            }}
                          >
                            Delete
                          </button>
                        </td>
                        <td>
                          <button onClick={() => {
                            setSaleItem({ prefix: item.prefix, size: sizeGroup.size, count: sizeGroup.count });
                            setShowSaleForm(true);
                          }}>
                            Make Sale
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
        )}

        <h2>Server information</h2>
        <b>Server address: http://localhost:8080</b>
      </main>
    </>
  );
}