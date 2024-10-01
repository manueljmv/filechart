const vscode = require('vscode');
const path = require('path');

function activate(context) {
    let panels = new Map();
    let states = new Map();
    let lastUsedColumns = new Map();

    let disposable = vscode.commands.registerCommand('extension.fileChart', async function () {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            const fileContent = document.getText();
            const { headers, data } = parseFile(fileContent);
            if (headers.length > 0) {
                const selectedColumns = await selectColumns(headers, document.fileName);
                if (selectedColumns) {
                    const chartType = await vscode.window.showQuickPick(['line', 'spline', 'bar', 'column', 'pie'], {
                        placeHolder: 'Select chart type'
                    });
                    if (chartType) {
                        const statistics = await selectStatistics();
                        const periods = await getMovingAveragePeriods(statistics);
                        const { series, categories } = processData(headers, data, selectedColumns, statistics, periods);
                        showChart(series, categories, document.fileName, chartType);
                    }
                }
            } else {
                vscode.window.showErrorMessage('No valid data found in the file.');
            }
        } else {
            vscode.window.showErrorMessage('No active text editor found.');
        }
    });

    context.subscriptions.push(disposable);

    async function selectColumns(headers, fileName) {
        const lastUsed = lastUsedColumns.get(fileName);
        const options = headers.map((header, index) => ({
            label: header,
            picked: lastUsed ? lastUsed.includes(index) : index > 0
        }));

        const selectedItems = await vscode.window.showQuickPick(options, {
            canPickMany: true,
            placeHolder: 'Select columns to display (first column is always included as categories)'
        });

        if (selectedItems && selectedItems.length > 0) {
            const selectedIndexes = selectedItems.map(item => headers.indexOf(item.label));
            lastUsedColumns.set(fileName, selectedIndexes);
            return [0, ...selectedIndexes];
        } else if (lastUsed) {
            return [0, ...lastUsed];
        }
        return null;
    }

    function parseFile(content) {
        const lines = content.split('\n').filter(line => line.trim() !== '');
        if (lines.length === 0) return { headers: [], data: [] };

        // Detect separator
        const firstLine = lines[0];
        let separator;
        if (firstLine.includes('\t')) separator = '\t';
        else if (firstLine.includes(';')) separator = ';';
        else if (firstLine.includes('|')) separator = '|';
        else {
            vscode.window.showWarningMessage('No valid separator detected. Defaulting to tab.');
            separator = '\t';
        }

        const headers = lines[0].split(separator).map(header => header.trim());
        const data = lines.slice(1).map(line => line.split(separator));

        return { headers, data };
    }

    async function selectStatistics() {
        const options = [
            { label: 'Max', description: 'Maximum value' },
            { label: 'Min', description: 'Minimum value' },
            { label: 'Average', description: 'Average value' },
            { label: 'SMA', description: 'Simple Moving Average' },
            { label: 'EMA', description: 'Exponential Moving Average' }
        ];

        const selectedItems = await vscode.window.showQuickPick(options, {
            canPickMany: true,
            placeHolder: 'Select statistics to display (optional)'
        });

        return selectedItems ? selectedItems.map(item => item.label) : [];
    }

    async function getMovingAveragePeriods(statistics) {
        const periods = {};
        
        if (statistics.includes('SMA')) {
            periods.sma = await getMovingAveragePeriod('SMA');
        }
        
        if (statistics.includes('EMA')) {
            periods.ema = await getMovingAveragePeriod('EMA');
        }
        
        return periods;
    }

    async function getMovingAveragePeriod(type) {
        const period = await vscode.window.showInputBox({
            prompt: `Enter the period for ${type} calculation`,
            placeHolder: 'e.g., 20',
            validateInput: (value) => {
                const num = parseInt(value);
                return (num > 0) ? null : 'Please enter a positive integer';
            }
        });
        return period ? parseInt(period) : 20; // Default to 20 if no input or cancelled
    }

    function processData(headers, data, selectedColumns, statistics, periods) {
        const categories = data.map(row => row[0]);
        const series = selectedColumns.slice(1).map(colIndex => ({
            name: headers[colIndex],
            data: data.map(row => {
                const value = parseFloat(row[colIndex]);
                return isNaN(value) ? null : value;
            })
        }));

        // Add statistics series
        series.forEach(s => {
            statistics.forEach(stat => {
                switch (stat) {
                    case 'Max':
                        series.push(createStatSeries(s, 'Max', Math.max));
                        break;
                    case 'Min':
                        series.push(createStatSeries(s, 'Min', Math.min));
                        break;
                    case 'Average':
                        series.push(createStatSeries(s, 'Avg', arr => arr.reduce((a, b) => a + b, 0) / arr.length));
                        break;
                    case 'SMA':
                        series.push(createSMA(s, periods.sma));
                        break;
                    case 'EMA':
                        series.push(createEMA(s, periods.ema));
                        break;
                }
            });
        });

        return { series, categories };
    }

    function createStatSeries(originalSeries, statName, statFunction) {
        const statValue = statFunction(originalSeries.data.filter(v => v !== null));
        return {
            name: `${originalSeries.name} (${statName})`,
            data: originalSeries.data.map(() => statValue),
            dashStyle: 'ShortDash',
            marker: { enabled: false }
        };
    }

    function createSMA(originalSeries, period) {
        const smaData = [];
        for (let i = 0; i < originalSeries.data.length; i++) {
            if (i < period - 1) {
                smaData.push(null);
            } else {
                const slice = originalSeries.data.slice(i - period + 1, i + 1);
                const avg = slice.reduce((sum, value) => sum + (value || 0), 0) / period;
                smaData.push(avg);
            }
        }
        return {
            name: `${originalSeries.name} (SMA ${period})`,
            data: smaData,
            dashStyle: 'ShortDash',
            marker: { enabled: false }
        };
    }

    function createEMA(originalSeries, period) {
        const k = 2 / (period + 1);
        let ema = originalSeries.data[0];
        const emaData = [ema];

        for (let i = 1; i < originalSeries.data.length; i++) {
            const value = originalSeries.data[i];
            if (value !== null) {
                ema = value * k + ema * (1 - k);
            }
            emaData.push(ema);
        }

        return {
            name: `${originalSeries.name} (EMA ${period})`,
            data: emaData,
            dashStyle: 'ShortDot',
            marker: { enabled: false }
        };
    }

    function showChart(series, categories, fileName, chartType) {
        const chartTitle = `Chart: ${path.basename(fileName)}`;
        const panelId = `chart-${fileName}`;
        
        let panel = panels.get(panelId);
        if (panel) {
            panel.reveal(vscode.ViewColumn.Active);
        } else {
            panel = vscode.window.createWebviewPanel(
                'highchart',
                chartTitle,
                vscode.ViewColumn.Active,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );
            panels.set(panelId, panel);

            panel.onDidDispose(
                () => {
                    panels.delete(panelId);
                    states.delete(panelId);
                },
                null,
                context.subscriptions
            );
        }

        const state = states.get(panelId);
        panel.webview.html = getWebviewContent(series, categories, chartTitle, chartType, state);

        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'stateUpdate':
                        states.set(panelId, message.state);
                        return;
                    case 'error':
                        vscode.window.showErrorMessage(message.text);
                        return;
                }
            },
            undefined,
            context.subscriptions
        );

        panel.onDidChangeViewState(
            e => {
                if (e.webviewPanel.visible) {
                    e.webviewPanel.webview.postMessage({ command: 'restoreState', state: states.get(panelId) });
                }
            },
            null,
            context.subscriptions
        );
    }

    function getWebviewContent(series, categories, chartTitle, chartType, state) {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${chartTitle}</title>
                <script src="https://code.highcharts.com/highcharts.js"></script>
                <script src="https://code.highcharts.com/modules/boost.js"></script>
                <script src="https://code.highcharts.com/modules/exporting.js"></script>
                <script src="https://code.highcharts.com/modules/export-data.js"></script>
                <script src="https://code.highcharts.com/modules/accessibility.js"></script>
                <style>
                    body, html, #container {
                        width: 100%;
                        height: 100%;
                        margin: 0;
                        padding: 0;
                        overflow: hidden;
                    }
                </style>
            </head>
            <body>
                <div id="container"></div>
                <script>
                    let chart;
                    const vscode = acquireVsCodeApi();

                    function createChart(state) {
                        Highcharts.setOptions({
                            boost: {
                                useGPUTranslations: true,
                                usePreAllocated: true
                            }
                        });
                        chart = Highcharts.chart('container', {
                            chart: {
                                type: '${chartType}',
                                animation: false,
                                boost: {
                                    enabled: true,
                                    useGPUTranslations: true,
                                    usePreAllocated: true
                                },
                                zoomType: 'xy',
                                panning: true,
                                panKey: 'shift',
                                events: {
                                    redraw: function() {
                                        saveState();
                                    }
                                }
                            },
                            title: {
                                text: '${chartTitle}'
                            },
                            xAxis: {
                                categories: ${JSON.stringify(categories)},
                                events: {
                                    afterSetExtremes: function() {
                                        saveState();
                                    }
                                }
                            },
                            yAxis: {
                                title: {
                                    text: 'Values'
                                },
                                events: {
                                    afterSetExtremes: function() {
                                        saveState();
                                    }
                                }
                            },
                            legend: {
                                layout: 'vertical',
                                align: 'right',
                                verticalAlign: 'middle'
                            },
                            series: ${JSON.stringify(series)},
                            responsive: {
                                rules: [{
                                    condition: {
                                        maxWidth: 500
                                    },
                                    chartOptions: {
                                        legend: {
                                            layout: 'horizontal',
                                            align: 'center',
                                            verticalAlign: 'bottom'
                                        }
                                    }
                                }]
                            },
                            tooltip: {
                                shared: true
                            },
                            plotOptions: {
                                series: {
                                    boostThreshold: 1000,
                                    pointStart: 0,
                                    events: {
                                        legendItemClick: function() {
                                            setTimeout(saveState, 0);
                                        }
                                    }
                                }
                            }
                        });

                        if (state) {
                            restoreState(state);
                        }
                    }

                    function saveState() {
                        const state = {
                            xAxis: chart.xAxis[0].getExtremes(),
                            yAxis: chart.yAxis[0].getExtremes(),
                            visibility: chart.series.map(s => s.visible)
                        };
                        vscode.postMessage({ command: 'stateUpdate', state: state });
                    }

                    function restoreState(state) {
                        if (state.xAxis) {
                            chart.xAxis[0].setExtremes(state.xAxis.min, state.xAxis.max, false);
                        }
                        if (state.yAxis) {
                            chart.yAxis[0].setExtremes(state.yAxis.min, state.yAxis.max, false);
                        }
                        if (state.visibility) {
                            chart.series.forEach((series, index) => {
                                if (series.visible !== state.visibility[index]) {
                                    series.setVisible(!series.visible, false);
                                }
                            });
                        }
                        chart.redraw();
                    }

                    createChart(${JSON.stringify(state)});

                    function resizeChart() {
                        if (chart) {
                            chart.setSize(window.innerWidth, window.innerHeight);
                        }
                    }

                    window.addEventListener('resize', resizeChart);
                    resizeChart(); // Initial resize

                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'restoreState':
                                if (message.state) {
                                    restoreState(message.state);
                                }
                                break;
                        }
                    });

                    window.addEventListener('error', function(event) {
                        vscode.postMessage({
                            command: 'error',
                            text: 'Error: ' + event.message + ' at ' + event.filename + ':' + event.lineno
                        });
                    });
                </script>
            </body>
            </html>
        `;
    }
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
}