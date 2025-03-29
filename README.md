# Sustainability Report Generator

A TypeScript-based tool that generates comprehensive sustainability reports using AI to analyze company data and create visualizations.

## Features

- Generates detailed sustainability reports with multiple sections
- Creates data visualizations using matplotlib
- Supports markdown and PDF output formats
- Uses AI to analyze and present data in a clear, concise manner

## Prerequisites

- Node.js (v14 or higher)
- Python (with matplotlib and numpy installed)
- OpenAI API key

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/sustainability-report-generator.git
cd sustainability-report-generator
```

2. Install dependencies:
```bash
npm install
```

3. Install Python dependencies:
```bash
pip install matplotlib numpy
```

4. Set up your OpenAI API key:
```bash
export OPENAI_API_KEY='your-api-key-here'
```

## Usage

1. Prepare your data in `report_logs.txt`

2. Run the report generator:
```bash
npm start
```

3. The generated report will be available in:
   - Markdown: `report.md`
   - PDF: `report.pdf`

## Project Structure

- `main.ts` - Main application code
- `prompts/` - Directory containing section-specific prompts
- `report_logs.txt` - Input data file
- `images/` - Generated graph images
- `report.md` - Generated markdown report
- `report.pdf` - Generated PDF report

## License

MIT License - feel free to use this project for your own purposes.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 