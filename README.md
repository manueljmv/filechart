# DataFile Chart

Reads data files (TSV, CSV, pipe-separated) from the active editor and renders
interactive charts using [Highcharts](https://www.highcharts.com/).

## Features

- Automatic separator detection (tab `;` `|`).
- Column picker: select which data columns to plot (first column is used as
  categories).
- Chart types: `line`, `spline`, `bar`, `column`, `pie`.
- Optional statistics series:
  - Max / Min / Average (horizontal reference lines).
  - Simple Moving Average (SMA).
  - Exponential Moving Average (EMA).
- GPU-accelerated rendering via the Highcharts Boost module for large datasets.
- Zoom, pan and export (PNG / JPEG / SVG / CSV).
- Per-file state retention: zoom range and series visibility are restored when
  reopening the same file's chart.

## Requirements

The chart is rendered in a webview that loads Highcharts from the public CDN,
so an internet connection is required on first use.

## Usage

1. Open a data file in the editor.
2. Run the command **DataFile Chart: Show Chart from Data File**
   (or the command `extension.fileChart`).
3. Pick the columns, the chart type and any optional statistics.

### Example input

```tsv
Date	Value1	Value2
2024-01-01	10	30
2024-01-02	15	28
2024-01-03	12	33
```

## Extension Settings

This extension does not contribute any settings yet.

## Known Issues

- Separator detection inspects only the first line; ambiguous delimiters
  (e.g. commas are not detected) default to tab.

## Release Notes

### 0.1.2

- Fixed duplicated webview listeners when reusing an existing panel.
- Fixed SMA/EMA/statistics series mishandling `null` and empty values.
- Fixed `selectColumns` returning duplicate index 0 and breaking on duplicate
  header names.
- Hardened webview HTML against injection and added a Content-Security-Policy.

### 0.1.1

- Initial release.

## License

MIT
