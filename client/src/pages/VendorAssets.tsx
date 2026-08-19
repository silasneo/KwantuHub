import { ArrowLeft, ArrowUpRight, Check, FileImage, FileText, FileUp, LoaderCircle, LogIn, Plus, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import { ChangeEvent, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { startLogin } from "@/const";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const acceptedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
type AssetKind = "storefront" | "listing" | "document";

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function toDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The selected file could not be read."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export default function VendorAssets() {
  const { isAuthenticated, loading } = useAuth();
  const [notice, setNotice] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<AssetKind>("listing");
  const fileInput = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const assetsQuery = trpc.vendorAssets.list.useQuery(undefined, { enabled: isAuthenticated });
  const uploadMutation = trpc.vendorAssets.upload.useMutation({
    onSuccess: async () => {
      setSelectedFile(null);
      setLabel("");
      if (fileInput.current) fileInput.current.value = "";
      await utils.vendorAssets.list.invalidate();
      setNotice("Your file is securely stored and ready to use.");
    },
    onError: (error) => setNotice(error.message || "The asset could not be uploaded."),
  });
  const removeMutation = trpc.vendorAssets.remove.useMutation({
    onSuccess: async () => {
      await utils.vendorAssets.list.invalidate();
      setNotice("The asset has been removed from your library.");
    },
    onError: (error) => setNotice(error.message || "The asset could not be removed."),
  });
  const canUpload = useMemo(() => Boolean(selectedFile && label.trim() && !uploadMutation.isPending), [selectedFile, label, uploadMutation.isPending]);

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  };

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!(acceptedTypes as readonly string[]).includes(file.type)) {
      notify("Choose a JPG, PNG, WEBP, or PDF file.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      notify("Files must be 5 MB or smaller.");
      event.target.value = "";
      return;
    }
    setSelectedFile(file);
    setLabel(file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
  };

  const uploadSelectedFile = async () => {
    if (!selectedFile || !label.trim()) return;
    try {
      const dataBase64 = await toDataUrl(selectedFile);
      uploadMutation.mutate({ originalName: selectedFile.name, mimeType: selectedFile.type as (typeof acceptedTypes)[number], byteSize: selectedFile.size, label: label.trim(), kind, dataBase64 });
    } catch (error) {
      notify(error instanceof Error ? error.message : "The selected file could not be prepared.");
    }
  };

  return (
    <div className="app-frame asset-room-page">
      <SiteHeader onNotice={notify} />
      <main>
        <section className="asset-room-hero">
          <div className="page-shell asset-room-hero-inner">
            <div><p className="section-index">Vendor portal — Asset room</p><h1>Keep your<br /><em>story within reach.</em></h1><p>Store storefront images, listing photographs, and supporting documents in one protected place.</p></div>
            <div className="asset-room-hero-mark"><img src="/manus-storage/Kwantu-identity_352aec3a.svg" alt="Kwantu heritage knot" /><span>People, practice<br />&amp; place.</span></div>
          </div>
        </section>

        {loading ? <section className="asset-room-loading"><LoaderCircle className="spin" size={29} /><span>Opening your asset room…</span></section> : !isAuthenticated ? (
          <section className="asset-room-gate"><div><p className="section-index">Vendor access</p><h2>Your storefront<br /><em>starts here.</em></h2><p>Sign in to upload and manage the original assets that help customers understand your work.</p><button type="button" className="button button-primary" onClick={startLogin}><LogIn size={17} /> Sign in to the Vendor Portal</button><Link href="/" className="asset-back-link"><ArrowLeft size={16} /> Return to the marketplace</Link></div><aside><ShieldCheck size={23} /><h3>Protected by design</h3><p>Only the account that uploads an asset can view its library or remove its metadata.</p><small>Images: JPG, PNG, WEBP<br />Documents: PDF · Up to 5 MB</small></aside></section>
        ) : (
          <section className="asset-room-content page-shell">
            <div className="asset-room-topline"><p><span>01</span> Your working archive</p><span>{assetsQuery.data?.length ?? 0} files in your room</span></div>
            <div className="asset-room-layout">
              <aside className="asset-upload-panel">
                <div className="asset-upload-title"><span className="gradient-rule" /><p className="section-index">Add an asset</p><h2>Make room<br />for the <em>real thing.</em></h2></div>
                <input ref={fileInput} id="vendor-file-upload" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={chooseFile} />
                {!selectedFile ? <label className="asset-dropzone" htmlFor="vendor-file-upload"><FileUp size={27} /><b>Select a file</b><span>JPG, PNG, WEBP, or PDF<br />up to 5 MB</span></label> : <div className="asset-selected-file"><button type="button" aria-label="Remove selected file" onClick={() => { setSelectedFile(null); setLabel(""); if (fileInput.current) fileInput.current.value = ""; }}><X size={15} /></button>{selectedFile.type === "application/pdf" ? <FileText size={32} /> : <FileImage size={32} />}<b>{selectedFile.name}</b><span>{formatBytes(selectedFile.size)} · {selectedFile.type.replace("image/", "").toUpperCase()}</span></div>}
                <label className="asset-field">Asset name<input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Winter storefront portrait" maxLength={160} /></label>
                <label className="asset-field">Use this for<select value={kind} onChange={(event) => setKind(event.target.value as AssetKind)}><option value="listing">Marketplace listing</option><option value="storefront">Storefront header</option><option value="document">Supporting document</option></select></label>
                <button type="button" className="asset-upload-button" disabled={!canUpload} onClick={uploadSelectedFile}>{uploadMutation.isPending ? <><LoaderCircle className="spin" size={17} /> Storing your asset…</> : <><Upload size={17} /> Upload to your room</>}</button>
                <p className="asset-upload-note">Files are stored in managed object storage. KwantuHub retains file metadata—not file bytes—in the marketplace database.</p>
              </aside>
              <div className="asset-library">
                <div className="asset-library-heading"><div><p className="section-index">Your collection</p><h2>Files with<br /><em>a future.</em></h2></div><button type="button" className="asset-mini-add" onClick={() => fileInput.current?.click()}><Plus size={15} /> Add file</button></div>
                {assetsQuery.isLoading ? <div className="asset-empty"><LoaderCircle className="spin" size={26} /><p>Gathering your archive…</p></div> : assetsQuery.data?.length ? <div className="asset-grid">{assetsQuery.data.map((asset) => <article className="asset-card" key={asset.id}><div className="asset-card-preview">{asset.mimeType === "application/pdf" ? <div className="asset-pdf-preview"><FileText size={38} /><span>PDF</span></div> : <img src={asset.url} alt={asset.label} />}<span className="asset-kind">{asset.kind}</span></div><div className="asset-card-body"><p>{asset.originalName}</p><h3>{asset.label}</h3><small>{formatBytes(asset.byteSize)} · {new Date(asset.createdAt).toLocaleDateString()}</small><div><a href={asset.url} target="_blank" rel="noreferrer">Open asset <ArrowUpRight size={15} /></a><button type="button" onClick={() => removeMutation.mutate({ id: asset.id })} disabled={removeMutation.isPending} aria-label={`Remove ${asset.label}`}><Trash2 size={15} /></button></div></div></article>)}</div> : <div className="asset-empty"><FileImage size={31} /><h3>This room is ready when you are.</h3><p>Add a hero image, product detail, or supporting document to begin building your vendor presence.</p><button type="button" className="button button-dark" onClick={() => fileInput.current?.click()}>Select your first file <ArrowUpRight size={17} /></button></div>}
              </div>
            </div>
          </section>
        )}
      </main>
      <SiteFooter onNotice={notify} />
      {notice && <div className="notice" role="status"><Check size={16} /> {notice}</div>}
    </div>
  );
}
