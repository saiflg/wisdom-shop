import Image from "next/image";
import Link from "next/link";
import { formatPrice, formatProductType, type Product } from "@/lib/catalog";

export function ProductCard({ product }: { product: Product }) {
  const image = product.images[0];

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white transition hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
    >
      {/* `contain` rather than `cover`: catalogue imagery is book covers and
          boxed software, and cropping those cuts off the title. */}
      <div className="relative aspect-square overflow-hidden bg-white p-3 dark:bg-slate-100">
        {image ? (
          <Image
            src={image.url}
            alt={image.altText ?? product.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-contain p-2 transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">No image</div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-brand-600 dark:text-brand-400">
          {formatProductType(product.type)}
        </span>
        {/* Clamped to two lines so cards in a row stay the same height
            regardless of title length. */}
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-slate-900 group-hover:text-brand-600 dark:text-slate-100 dark:group-hover:text-brand-400">
          {product.title}
        </h3>
        <p className="mt-auto pt-2 text-lg font-bold">
          {formatPrice(product.priceCents, product.currency)}
        </p>
      </div>
    </Link>
  );
}
