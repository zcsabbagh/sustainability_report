import { z } from 'zod';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { execSync } from 'child_process';
import path from 'path';

type SectionResult = {
    markdown_text: string;
    tables?: { headers: string[]; rows: string[][]; }[];
    graph_code?: string;
    recommendations?: string[];
    graph_image?: string;
};

const sectionSchema = z.object({
    section: z.object({
        markdown_text: z.string(),
        tables: z.array(z.object({
            headers: z.array(z.string()),
            rows: z.array(z.array(z.string()))
        })).optional(),
        graph_code: z.string().optional(),
        recommendations: z.array(z.string()).optional(),
        graph_image: z.string().optional()
    })
});

function readSectionPrompts(): string[] {
    const sections = [
        '1_baseline_company_data.txt',
        '2_sustainability_goals.txt', 
        '3_factory_emissions.txt',
        '4_materials_emissions.txt',
        '5_packaging_emissions.txt',
        '6_logistics_emissions.txt',
        '7_action_plan.txt'
    ];
    
    return sections.map(filename => 
        readFileSync(`prompts/${filename}`, 'utf8')
    );
}

function getContentPrompt(section: string, log_data: string): string {
    return `
    You are a sustainability expert. 
    Generate concise markdown text and tables and code for graphs for the company data provided.
    Data provided:
    ${log_data}

    Adhere to the following instructions:
    ${section}

    You will only be completing one section of the report document. Do not output a section title or header.
    
    If there is a graph, output code for the graph in the graph_code field. VERY IMPORTANT:
    - The graph_code must be PURE Python code only - do NOT include markdown formatting
    - DO NOT wrap the code in triple backticks or markdown code blocks
    - DO NOT include \`\`\`python or \`\`\` markers anywhere in the code
    - Include required libraries (matplotlib.pyplot, numpy, etc.)
    - Define the data to plot clearly
    - Create visualizations with proper labels and titles
    - Do NOT include plt.show() as images will be saved programmatically

    Be extremely concise - focus on key metrics and insights only.
    Present data in tables when possible instead of explaining it in paragraphs.
    Limit your markdown text to 2-3 short sentences for context only.
    Round all numbers in tables and text to whole numbers for better readability.

    Not every section needs a graph or table. Only include this when necessary. The explanation should not simply describe the table or chart.
    `;
}

function getFormattingPrompt(section: SectionResult): string {
    return `
    You are a markdown formatting expert. Format the following content according to markdown best practices:

    Original content:
    ${JSON.stringify(section, null, 2)}

    Requirements:
    1. Tables should be properly formatted with standard markdown syntax (headers, dividers, etc.)
    2. IMPORTANT: Ensure there are NO duplicate tables or text - remove any repetition
    3. Keep text extremely concise - if the same information appears in a table, don't repeat it in text
    4. Recommendations should be bullet points prefixed with "*" 
    5. Ensure Python code is runnable
    6. Use consistent formatting throughout
    7. Round all numbers to the nearest whole number
    8. Use commas to separate large numbers

    Return the formatted content in the same JSON structure.
    `;
}

async function generateSectionContent(sections: string[], log_data: string): Promise<SectionResult[]> {
    const sectionPromises = sections.map((section, index) => 
        generateObject({
            model: openai('gpt-4'),
            schema: sectionSchema,
            prompt: getContentPrompt(section, log_data),
        }).then(result => ({
            index,
            section: result.object.section
        }))
    );

    const results = await Promise.all(sectionPromises);
    return results
        .sort((a, b) => a.index - b.index)
        .map(result => result.section);
}

async function formatSectionContent(sections: SectionResult[]): Promise<SectionResult[]> {
    const formattingPromises = sections.map((section, index) =>
        generateObject({
            model: openai('gpt-4'),
            schema: sectionSchema,
            prompt: getFormattingPrompt(section),
        }).then(result => ({
            index,
            section: result.object.section
        }))
    );

    const formattingResults = await Promise.all(formattingPromises);
    return formattingResults
        .sort((a, b) => a.index - b.index)
        .map(result => result.section);
}

function generateGraphImages(sections: SectionResult[]): SectionResult[] {
    if (!existsSync('images')) {
        mkdirSync('images');
    }

    console.log("Starting graph generation...");

    // Just use 'python' command as specified
    const pythonCommand = 'python';
    console.log(`Using Python command: ${pythonCommand}`);

    return sections.map((section, index) => {
        if (section.graph_code) {
            console.log(`Processing graph for section ${index}...`);
            
            // Clean the graph code - remove markdown formatting if present
            let cleanCode = section.graph_code || '';
            
            // More aggressive markdown code block removal
            cleanCode = cleanCode.replace(/```python\n/g, '').replace(/```python/g, '');
            cleanCode = cleanCode.replace(/```\n/g, '').replace(/```/g, '');
            
            // Add indentation to each line for the Python template
            const codeLines = cleanCode.split('\n');
            const indentedCode = codeLines.map(line => `    ${line}`).join('\n');
            
            console.log(`Graph code for section ${index} (first 100 chars): ${indentedCode.substring(0, 100)}...`);
            
            const pythonFile = `temp_graph_${index}.py`;
            const wrappedCode = `
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
import numpy as np  # Commonly needed for data manipulation

try:
    # User provided graph code
${indentedCode}

    # Ensure the plot is saved and closed
    plt.savefig('images/graph_${index}.png')
    plt.close()
    print(f"Successfully saved graph to images/graph_${index}.png")
except Exception as e:
    print(f"Error generating graph: {str(e)}")
    raise e
`;
            writeFileSync(pythonFile, wrappedCode);
            
            try {
                console.log(`Executing Python code for section ${index}...`);
                // Let's write the executed code to a debug file so we can inspect it
                writeFileSync(`debug_python_${index}.py`, wrappedCode);
                execSync(`${pythonCommand} ${pythonFile}`, { stdio: 'inherit' });
                console.log(`Successfully generated graph for section ${index}`);
                section.graph_image = `images/graph_${index}.png`;
            } catch (error) {
                console.error(`Error executing graph code for section ${index}:`, error);
                // Write the error to a log file to help with debugging
                writeFileSync(`graph_error_${index}.log`, JSON.stringify({
                    error: String(error),
                    code: section.graph_code
                }, null, 2));
            } finally {
                if (existsSync(pythonFile)) {
                    unlinkSync(pythonFile);
                }
            }
        }
        return section;
    });
}

function generateMarkdownContent(sections: SectionResult[]): string {
    return sections.map((section, index) => {
        // Build the markdown section
        let markdown = `\n### ${getSectionTitle(index)}\n${section.markdown_text}`;
        
        // Add graph if available
        if (section.graph_image) {
            markdown += `\n\n![Graph ${index + 1}](${section.graph_image})`;
        }
        
        // Add tables with proper markdown formatting
        if (section.tables && section.tables.length > 0) {
            section.tables.forEach(table => {
                markdown += '\n\n';
                // Add headers
                markdown += `| ${table.headers.join(' | ')} |\n`;
                // Add separator row
                markdown += `| ${table.headers.map(() => '---').join(' | ')} |\n`;
                // Add data rows
                table.rows.forEach(row => {
                    markdown += `| ${row.join(' | ')} |\n`;
                });
            });
        }
        
        return markdown;
    }).join('\n');
}

function getSectionTitle(index: number): string {
    const titles = [
        '🧾 1. Baseline Company Data',
        '🎯 2. Sustainability Goals',
        '🔍 3. Factory Emissions',
        '🧱 4. Materials Emissions',
        '📦 5. Packaging Emissions',
        '🚛 6. Logistics Emissions',
        '📌 7. Action Plan / Summary'
    ];
    return titles[index];
}

function convertToPDF(markdownContent: string): void {
    writeFileSync('report.md', markdownContent);
    
    try {
        execSync('mdpdf report.md -o report.pdf', { stdio: 'inherit' });
        console.log('Successfully converted markdown to PDF');
    } catch (error) {
        console.error('Error converting markdown to PDF:', error);
    }
}

async function generateReport(): Promise<void> {
    const log_data = readFileSync('report_logs.txt', 'utf8');
    const sectionPrompts = readSectionPrompts();
    
    // Generate initial content
    let sections = await generateSectionContent(sectionPrompts, log_data);
    
    // Format the content
    sections = await formatSectionContent(sections);
    
    // Generate graph images
    sections = generateGraphImages(sections);
    
    // Generate markdown content
    const markdownContent = generateMarkdownContent(sections);
    
    // Convert to PDF
    convertToPDF(markdownContent);
}

// Execute the report generation
generateReport().catch(console.error);
