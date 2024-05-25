const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  productName: String,
  productDetails: String,
  productSku: String,
  productBrand: String,
  productPrice: String,
  productStock: Number,
  productImageUrl: String,
  productCategory: String,
  productStatus: Boolean,
  productSupplier: String,
  productAccessories: String,
  outOfStock: {
    type: Boolean,
    default: false,
  },
  productCreated: {
    type: Date,
    default: Date.now,
  },
  productModified: Date,
  productManufactureRefID: String,
  productType: String,
});

const hughesProductData = mongoose.model("HughesProductData", productSchema);
const hubbardProductData = mongoose.model("HubbardProductData", productSchema);
const reeceProductData = mongoose.model("ReeceProductData", productSchema);

module.exports = { hughesProductData, hubbardProductData, reeceProductData };
