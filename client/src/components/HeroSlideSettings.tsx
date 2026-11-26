import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  defaultHeroSlides,
  heroContentSchema,
  type HeroContent,
} from "@shared/siteContent";
import { mediaUrl } from "@/lib/storage";

const contentFields = [
  "label",
  "eyebrow",
  "headline",
  "emphasis",
  "description",
  "primaryLabel",
  "primaryHref",
  "secondaryLabel",
  "secondaryHref",
  "note",
  "alt",
] as const;
const dateInput = (value: string | Date | null) =>
  value ? new Date(value).toISOString().slice(0, 16) : "";

export function HeroSlideSettings() {
  const utils = trpc.useUtils();
  const slides = trpc.admin.heroSlides.useQuery();
  const [id, setId] = useState<number>();
  const [revision, setRevision] = useState<number>();
  const [content, setContent] = useState<HeroContent>(defaultHeroSlides[0]);
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const save = trpc.admin.saveHeroSlide.useMutation({
    onSuccess: result => {
      setId(result.id);
      setRevision(undefined);
      setReason("");
      utils.admin.heroSlides.invalidate();
      utils.siteContent.heroSlides.invalidate();
    },
  });
  const upload = trpc.admin.uploadHeroImage.useMutation({
    onSuccess: result => setContent(value => ({ ...value, image: result.url })),
  });
  const busy = save.isPending || upload.isPending;
  return (
    <section className="space-y-5">
      <h2 className="font-serif text-2xl font-bold">Homepage hero slides</h2>
      <p className="text-sm">
        Up to 100 slides. Schedules use UTC. Changes are audited; public caches
        refresh within 30 seconds. Select a saved slide before editing again.
      </p>
      {slides.isLoading && <p role="status">Loading slides...</p>}
      {slides.error && (
        <p role="alert">
          {slides.error.message}{" "}
          <button onClick={() => slides.refetch()}>Retry</button>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="border p-2"
          onClick={() => {
            setId(undefined);
            setRevision(undefined);
            setContent(defaultHeroSlides[0]);
            setIsActive(false);
            setSortOrder(slides.data?.length ?? 0);
            setStartsAt("");
            setEndsAt("");
            setError("");
          }}
        >
          New slide
        </button>
        {slides.data?.map(row => (
          <button
            key={row.id}
            type="button"
            disabled={busy}
            className="border p-2"
            onClick={() => {
              setId(row.id);
              setRevision(row.revision);
              setContent(row.content);
              setSortOrder(row.sortOrder);
              setIsActive(row.isActive);
              setStartsAt(dateInput(row.startsAt));
              setEndsAt(dateInput(row.endsAt));
              setError("");
            }}
          >
            {row.sortOrder}: {row.content.label} (
            {row.isActive ? "active" : "inactive"})
          </button>
        ))}
      </div>
      <form
        className="bg-white border rounded p-5 space-y-3"
        onSubmit={event => {
          event.preventDefault();
          setError("");
          const parsed = heroContentSchema.safeParse(content);
          if (!parsed.success) {
            setError(
              parsed.error.issues
                .map(issue => `${issue.path.join(".")}: ${issue.message}`)
                .join("; ")
            );
            return;
          }
          save.mutate({
            id,
            revision,
            content: parsed.data,
            sortOrder,
            isActive,
            reason,
            startsAt: startsAt ? `${startsAt}:00Z` : null,
            endsAt: endsAt ? `${endsAt}:00Z` : null,
          });
        }}
      >
        <h3 className="font-bold">
          {id ? `Editing slide ${id}` : "New inactive slide"}
        </h3>
        {contentFields.map(field => (
          <label key={field} className="block text-sm">
            {field.replace(/([A-Z])/g, " $1")}
            <input
              className="block border p-2 w-full"
              value={content[field]}
              required={!["emphasis", "note"].includes(field)}
              onChange={event =>
                setContent(value => ({ ...value, [field]: event.target.value }))
              }
            />
          </label>
        ))}
        <label className="block text-sm">
          Image (JPEG, PNG or WebP, up to 5 MB)
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            className="block"
            onChange={async event => {
              const file = event.target.files?.[0];
              if (!file) return;
              setError("");
              if (file.size > 5 * 1024 * 1024) {
                setError("Image must be 5 MB or smaller.");
                return;
              }
              try {
                const reader = new FileReader();
                const base64 = await new Promise<string>((resolve, reject) => {
                  reader.onerror = () =>
                    reject(new Error("Could not read image."));
                  reader.onload = () =>
                    resolve(String(reader.result).split(",")[1] ?? "");
                  reader.readAsDataURL(file);
                });
                upload.mutate({ base64 });
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : "Image read failed."
                );
              }
            }}
          />
        </label>
        <label className="block">
          Order{" "}
          <input
            required
            type="number"
            min={0}
            max={10000}
            value={sortOrder}
            onChange={event => setSortOrder(Number(event.target.value))}
          />
        </label>
        <label className="block">
          <input
            type="checkbox"
            checked={isActive}
            onChange={event => setIsActive(event.target.checked)}
          />{" "}
          Active
        </label>
        <label className="block">
          Starts at (UTC){" "}
          <input
            type="datetime-local"
            value={startsAt}
            onChange={event => setStartsAt(event.target.value)}
          />
        </label>
        <label className="block">
          Ends at (UTC){" "}
          <input
            type="datetime-local"
            value={endsAt}
            onChange={event => setEndsAt(event.target.value)}
          />
        </label>
        <label className="block">
          Reason{" "}
          <input
            required
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={event => setReason(event.target.value)}
            className="border p-2"
          />
        </label>
        {(error || save.error || upload.error) && (
          <p role="alert" className="form-error">
            {error || save.error?.message || upload.error?.message}
          </p>
        )}
        {save.isSuccess && (
          <p role="status">
            Slide saved. Select it above to load its latest revision.
          </p>
        )}
        <button
          disabled={busy || Boolean(id && !revision)}
          className="brand-gradient text-white p-3 rounded"
        >
          {save.isPending ? "Saving..." : "Save slide"}
        </button>
      </form>
      <div
        aria-label="Slide preview"
        className="bg-black text-white rounded p-8 space-y-4"
      >
        <p className="text-sm">
          Preview only — scheduling and activation still control publication.
        </p>
        <img
          src={mediaUrl(content.image)}
          alt={content.alt}
          className="w-full max-h-64 object-cover"
        />
        <p>{content.eyebrow}</p>
        <h3 className="font-serif text-4xl">
          {content.headline} <em>{content.emphasis}</em>
        </h3>
        <p>{content.description}</p>
        <span className="inline-block border p-2">
          {content.primaryLabel}
        </span>{" "}
        <span className="inline-block border p-2">
          {content.secondaryLabel}
        </span>
        <p>{content.note}</p>
      </div>
    </section>
  );
}
