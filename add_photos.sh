#!/bin/bash
# add_photos.sh
# Drag-and-drop any images from Downloads into the portfolio, then commit + push.
# Usage: ./add_photos.sh
# Or pass files directly: ./add_photos.sh ~/Downloads/photo1.avif ~/Downloads/photo2.jpg

REPO="$(cd "$(dirname "$0")" && pwd)"
IMAGES="$REPO/images"

echo ""
echo "=== Portfolio Photo Adder ==="
echo ""

# If files passed as arguments, use those. Otherwise scan Downloads.
if [ "$#" -gt 0 ]; then
  FILES=("$@")
else
  mapfile -t FILES < <(find ~/Downloads -maxdepth 1 -type f \( \
    -iname "*.avif" -o -iname "*.jpg" -o -iname "*.jpeg" \
    -o -iname "*.png"  -o -iname "*.webp" \) | sort)
fi

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "No image files found in ~/Downloads."
  echo "Drop images into ~/Downloads and run again, or pass files as arguments."
  exit 0
fi

echo "Found ${#FILES[@]} image(s):"
for f in "${FILES[@]}"; do
  echo "  $(basename "$f")"
done
echo ""

read -r -p "Copy all of these to images/ ? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

ADDED=()
for f in "${FILES[@]}"; do
  name="$(basename "$f")"
  dest="$IMAGES/$name"
  if [ -f "$dest" ]; then
    echo "  SKIP (already exists): $name"
  else
    cp "$f" "$dest"
    echo "  ADDED: $name"
    ADDED+=("images/$name")
  fi
done

if [ "${#ADDED[@]}" -eq 0 ]; then
  echo ""
  echo "Nothing new to commit."
  exit 0
fi

echo ""
echo "Added ${#ADDED[@]} photo(s). Committing and pushing..."
cd "$REPO" || exit 1
git add "${ADDED[@]}"
git commit -m "Add photos: ${ADDED[*]}"
git push

echo ""
echo "Done! Add the paths to your spreadsheet:"
for f in "${ADDED[@]}"; do
  echo "  $f"
done
echo ""
