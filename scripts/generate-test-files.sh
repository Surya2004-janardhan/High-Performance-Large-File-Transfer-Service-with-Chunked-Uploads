#!/bin/bash

# Generate test files of various sizes for testing

SIZES=("100kb" "10mb" "100mb" "1gb")
OUTPUT_DIR="${1:-.}"

for size in "${SIZES[@]}"; do
  case $size in
    100kb)
      COUNT=100
      UNIT="k"
      ;;
    10mb)
      COUNT=10
      UNIT="M"
      ;;
    100mb)
      COUNT=100
      UNIT="M"
      ;;
    1gb)
      COUNT=1
      UNIT="G"
      ;;
  esac

  FILE="$OUTPUT_DIR/test-$size.bin"
  echo "Creating $FILE..."
  dd if=/dev/zero of="$FILE" bs=1$UNIT count=$COUNT 2>/dev/null
  echo "Created $(du -h "$FILE" | cut -f1) $FILE"
done
