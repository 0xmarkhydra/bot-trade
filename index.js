require('dotenv').config();
const ccxt = require('ccxt');

const isProd =  process.env.APP_ENV === 'production'
const optionCCXT = isProd ? {
    apiKey: process.env.API_KEY,
    secret: process.env.SECRET_KEY,
    options: {
        defaultType: 'future', // Nếu bạn đang giao dịch futures
        adjustForTimeDifference: true,
    },
} : {
    apiKey: process.env.API_KEY_TEST,
    secret: process.env.SECRET_KEY_TEST,
    options: {
        defaultType: 'future', // Nếu bạn đang giao dịch futures
        adjustForTimeDifference: true,
        test: true, // Thiết lập này để sử dụng Testnet
    },
    // enableRateLimit: true, // Bật giới hạn tần suất
};

function formatBalanceData(balanceData) {
    return balanceData.map(entry => {
        const [timestamp, open, high, low, close, volume] = entry;
        return {
            timestamp: new Date(timestamp).toISOString(),
            open,
            high,
            low,
            close,
            volume
        };
    });
}

// Thiết lập API Key và Secret
let binance;
try {
    binance = new ccxt.binance(optionCCXT);
    if (!isProd) {
        binance.setSandboxMode(true);
    }
} catch (error) {
    console.error('Error initializing ccxt:', error);
    process.exit(1);
}

async function getBalance() {
    try {
        const balance = await binance.fetchBalance();
        console.log('balance:', balance);
    } catch (error) {
        console.error('Error getting balance:', error);
    }
}
// TODO step 1: lắng nghe giá để tính toán điểm vào và điểm ra

// TODO: Công thức tính điểm vào và điểm ra
// + Dựa vào giá cao nhất 24h, và giá thấp nhất 24h
// + Điểm vào = giá cao nhất 24h + (giá cao nhất 24h - giá thấp nhất 24h) * 0.382
async function calculateEntryPoint() {
    try {
        const ohlcv = await binance.fetchOHLCV('DOGS/USDT', '1d', undefined, 3);
        console.log('OHLCV:', ohlcv.map(iten => {
            const [timestamp, open, high, low, close, volume] = iten;
            return {
                timestamp: new Date(timestamp).toLocaleString('vi-VN'),
                open,
                high,
                low,
                close,
                volume
            };
        }))
        const [timestamp, open, high, low, close, volume] = ohlcv[1];
        // console.log('OHLCV:', {
        //     // Chuyển đổi timestamp sang dạng ngày tháng giờ của Việt Nam giờ:phút, ngày/tháng/năm
        //     // timestamp: new Date(timestamp).toISOString(),
        //     timestamp: new Date(timestamp).toLocaleString('vi-VN'),
        //     open,
        //     high,
        //     low,
        //     close,
        //     volume
        // });
        const entryPoint = open + ((high - low) / 2) * 0.369;
        console.log('Entry Point:', entryPoint);
    } catch (error) {
        console.error('Error fetching OHLCV data:', error);
    }
}


function calculateRSI(closes, period) {
    let gains = 0;
    let losses = 0;

    for (let i = 1; i < period + 1; i++) {
        const change = closes[i] - closes[i - 1];
        if (change > 0) {
            gains += change;
        } else {
            losses -= change;
        }
    }

    const averageGain = gains / period;
    const averageLoss = losses / period;

    const rs = averageGain / averageLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
}

function calculateEMA(closes, period) {
    const k = 2 / (period + 1);
    return closes.reduce((acc, close, index) => {
        if (index === 0) return close;
        return close * k + acc * (1 - k);
    });
}

function calculateSMA(closes, period) {
    const sum = closes.slice(period).reduce((acc, close) => acc + close, 0);
    return sum / period;
}
function calculateBollingerBands(closes, period = 20, multiplier = 2) {
    const sma = calculateSMA(closes, period);
    const stdDev = Math.sqrt(closes.slice(period).reduce((acc, close) => acc + Math.pow(close - sma, 2), 0) / period);
    const upperBand = sma + (multiplier * stdDev);
    const lowerBand = sma - (multiplier * stdDev);
    return { upperBand, lowerBand, sma };
}

function calculateStochasticOscillator(closes, period = 14) {
    const highestHigh = Math.max(...closes.slice(period));
    const lowestLow = Math.min(...closes.slice(period));
    const currentClose = closes[closes.length - 1];
    const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    return k;
}

function calculateATR(ohlcv, period = 14) {
    const trueRanges = ohlcv.slice(1).map((candle, index) => {
        const [timestamp, open, high, low, close, volume] = candle;
        const prevClose = ohlcv[index][4];
        return Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    });
    const atr = trueRanges.slice(period).reduce((acc, tr) => acc + tr, 0) / period;
    return atr;
}

function determineTrend(bollingerBands, stochasticOscillator, atr, currentPrice) {
    let trend = 'SIDEWAYS';

    // Bollinger Bands
    if (currentPrice > bollingerBands.upperBand) {
        trend = 'LONG';
    } else if (currentPrice < bollingerBands.lowerBand) {
        trend = 'SHORT';
    }

    // Stochastic Oscillator
    if (stochasticOscillator > 80) {
        trend = 'LONG';
    } else if (stochasticOscillator < 20) {
        trend = 'SHORT';
    }

    // ATR (used for volatility, not directly for trend)
    console.log('ATR (Volatility):', atr);

    return trend;
}


function calculateEntryAndTakeProfit(currentPrice, atr, stopLoss, riskRewardRatio, k = 1) {
    // Tính điểm entry
    // const entry = currentPrice - (k * atr);
    const entry = currentPrice;

    // Tính take profit dựa trên tỷ lệ R:R
    const takeProfit = entry + (riskRewardRatio * stopLoss);

    return {
        entry: entry,
        takeProfit: takeProfit
    };
}

function calculateSupportResistance(ohlcv) {
    console.log('ohlcv:', ohlcv);
    const highs = ohlcv.map(candle => candle[2]);
    const lows = ohlcv.map(candle => candle[3]);

    const resistance = Math.max(...highs);
    const support = Math.min(...lows);

    return { support, resistance };
}

function calculateEntryPoint(currentPrice, support, resistance) {
    let entryPoint = null;

    if (currentPrice < support) {
        entryPoint = support; // Entry at support level
    } else if (currentPrice > resistance) {
        entryPoint = resistance; // Entry at resistance level
    } else {
        entryPoint = (support + resistance) / 2; // Entry at midpoint
    }

    return entryPoint;
}

async function getCurrentPrice(symbol) {
    try {
        const ohlcv = await binance.fetchOHLCV(symbol, '1m', undefined, 1); // Fetch the latest 1-minute candle
        const currentPrice = ohlcv[0][4]; // Get the closing price of the latest candle
        return {
            currentPrice: currentPrice,
            ohlcv: ohlcv
        };
    } catch (error) {
        console.error('Error fetching current price:', error);
    }
}

async function calculateMovingAverages() {
    try {
        const _ohlcv = await binance.fetchOHLCV('BTC/USDT', '1d', undefined, 150);
        let ohlcv = _ohlcv.reverse();
        // ohlcv = ohlcv.slice(2);
        // console.log('OHLCV:', ohlcv.map(iten => {
        //     const [timestamp, open, high, low, close, volume] = iten;
        //     return {
        //         timestamp: new Date(timestamp).toLocaleString('vi-VN'),
        //         open,
        //         high,
        //         low,
        //         close,
        //         volume
        //     };
        // }))
        const closes = ohlcv.map(candle => candle[4]); // Lấy giá đóng cửa (close)

        const calculateMA = (period) => {
            const relevantCloses = closes.slice(period);
            return relevantCloses.reduce((sum, close) => sum + close, 0) / relevantCloses.length;
        };


        const ma7 = calculateMA(7);
        const ma25 = calculateMA(25);
        const ma99 = calculateMA(99);

        console.log('---------------[MA]--------------')
        console.log('MA7:', ma7);
        console.log('MA25:', ma25);
        console.log('MA99:', ma99);

        const maName = 'MA: ';
        // Ví dụ về tín hiệu giao dịch
        if (ma7 > ma25 && ma25 > ma99) {
            console.log(maName + 'Xu hướng tăng mạnh (LONG)');
        } else if (ma7 < ma25 && ma25 < ma99) {
            console.log(maName + 'Xu hướng giảm mạnh (SHORT)');
        } else {
            console.log(maName + 'Xu hướng không rõ ràng (SIDEWAYS)');
        }
        console.log('---------------[RSI]--------------')
        // Dự đoán xu hướng bằng cách sử dụng RSI
        const rsi = calculateRSI(closes, 14);
        console.log('RSI14:', rsi);

        const rsiName = 'RSI14: ';
        if (rsi > 70) {
            console.log(rsiName + 'Thị trường đang quá mua, có thể sẽ giảm (LONG)');
        } else if (rsi < 30) {
            console.log(rsiName + 'Thị trường đang quá bán, có thể sẽ tăng (LONG)');
        } else {
            console.log(rsiName + 'Thị trường đang trong trạng thái bình thường (SIDEWAYS)');
        }

        console.log('---------------[MACD]-------------')
        function calculateEMA(closes, period) {
            const k = 2 / (period + 1);
            return closes.reduce((acc, close, index) => {
                if (index === 0) return close;
                return close * k + acc * (1 - k);
            });
        }
        const ema12 = calculateEMA(closes,12);
        const ema26 = calculateEMA(closes, 26);
        const macd = ema12 - ema26;
        const signalLine = calculateEMA([macd], 9);
        const histogram = macd - signalLine;

        console.log('EMA12:', ema12);
        console.log('EMA26:', ema26);
        console.log('MACD:', macd);
        console.log('Signal Line:', signalLine);
        console.log('Histogram:', histogram);

        // Xác định lệnh Long hay Short
        if (macd > signalLine) {
            console.log('Trade Signal: LONG');
        } else if (macd < signalLine) {
            console.log('Trade Signal: SHORT');
        } else {
            console.log('Trade Signal: SIDEWAYS');
        }

        console.log('---------------[Bollinger Bands]-------------')
        const bollingerBands = calculateBollingerBands(closes);
        console.log('Bollinger Bands:', bollingerBands);

        console.log('---------------[Stochastic Oscillator]-------------')
        const stochasticOscillator = calculateStochasticOscillator(closes);
        console.log('Stochastic Oscillator:', stochasticOscillator);
        console.log('---------------[ATR]-------------')
        const atr = calculateATR(ohlcv);
        console.log('ATR:', atr);

        const currentPrice = closes[closes.length - 1];
        const trend = determineTrend(bollingerBands, stochasticOscillator, atr, currentPrice);
        console.log('Trend (Bollinger Bands + Stochastic Oscillator):', trend);

        console.log('---------------[ohlcv]-------------')
        const [timestamp, open, high, low, close, volume] = ohlcv[0];

        console.log('ohlcv:', {
            timestamp: new Date(timestamp).toLocaleString('vi-VN'),
            open,
            high,
            low,
            close,
            volume
        });

        console.log('---------------[Current Price]-------------')
        const current = await getCurrentPrice('BTC/USDT');
        const { currentPrice: currentPrice1, ohlcv: ohlcv1 } = current;
        console.log('Current Price:', currentPrice1);

        console.log('---------------[Entry and Take Profit]-------------')
        const { support, resistance } = calculateSupportResistance(ohlcv1);
        const entryPoint = calculateEntryPoint(currentPrice1, support, resistance);

        console.log('Support:', support);
        console.log('Resistance:', resistance);

        const stopLoss = 2;
        const riskRewardRatio = 2; // Tỷ lệ R:R mong muốn
        const result = calculateEntryAndTakeProfit(entryPoint, atr, stopLoss, riskRewardRatio);
        console.log(`Entry : ${result.entry.toFixed(2)}`);
        console.log(`Take Profit: ${result.takeProfit.toFixed(2)}`);
        console.log('---------------[END]-------------')
    } catch (error) {
        console.error('Error fetching OHLCV data:', error);
    }
}

calculateMovingAverages();


// TODO step 2: tính toán điểm vào và điểm ra

// TODO step 3: đặt lệnh set limit future

