// Khởi tạo các giá trị đầu vào
const initialCapital = 10; // Số vốn ban đầu (USD)
const leverage = 30; // Đòn bẩy
const initialPrice = 138; // Giá ban đầu (USD)
const currentPrice = 140; // Giá hiện tại (USD)

// Tính toán tỷ lệ thay đổi giá
const priceChangePercentage = ((currentPrice - initialPrice) / initialPrice) * 100;

// Tính toán giá trị vị thế
const positionValue = initialCapital * leverage;

// Tính toán lợi nhuận hoặc thua lỗ
const profitOrLoss = (positionValue * priceChangePercentage) / 100;

// Tính toán tổng vốn sau khi có lợi nhuận hoặc thua lỗ
const finalCapital = initialCapital + profitOrLoss;

// Tính toán giá thanh lý (giá giảm 3,33% sẽ dẫn đến thanh lý)
const liquidationPrice = initialPrice * (1 - 1 / leverage);

// Tính toán margin cần thiết để tránh bị thanh lý
function calculateRequiredMargin(currentPrice, liquidationPrice, leverage) {
    // Số tiền cần nạp thêm để đẩy giá thanh lý xuống thấp hơn giá hiện tại
    const requiredMargin = leverage * (liquidationPrice - currentPrice);
    return Math.max(requiredMargin, 0); // Trả về 0 nếu không cần thêm margin
}

// Kết quả
console.log("Giá trị vị thế: $" + positionValue.toFixed(2));
console.log("Lợi nhuận hoặc thua lỗ: $" + (profitOrLoss >= 0 ? "+" : "") + profitOrLoss.toFixed(2));
console.log("Tổng vốn sau giao dịch: $" + finalCapital.toFixed(2));
console.log("Giá thanh lý: $" + liquidationPrice.toFixed(2));

// Kiểm tra xem có bị thanh lý không
if (currentPrice <= liquidationPrice) {
    console.log("Vị thế của bạn đã bị thanh lý!");
} else {
    console.log("Vị thế của bạn vẫn an toàn.");
}

// Kiểm tra và tính toán margin cần thiết để tránh bị thanh lý
if (currentPrice <= liquidationPrice) {
    const requiredMargin = calculateRequiredMargin(currentPrice, liquidationPrice, leverage);
    console.log("Bạn cần bơm thêm margin để tránh bị thanh lý: $" + requiredMargin.toFixed(2));
} else {
    console.log("Bạn không cần bơm thêm margin.");
}
