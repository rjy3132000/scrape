const {
  hughesProductData,
  hubbardProductData,
  reeceProductData,
} = require("../model/productSchema");

async function productRecordsSaveInDB(schemaName, productArray) {
  try {
    // Check if productArray is an array
    if (!Array.isArray(productArray)) {
      throw new TypeError("productArray must be an array");
    }

    // Select the appropriate schema
    const Schema = {
      hughes: hughesProductData,
      hubbard: hubbardProductData,
      reece: reeceProductData,
    }[schemaName];

    if (!Schema) throw new Error("Invalid schema name provided");

    for (const product of productArray) {
      try {
        const query =
          schemaName === "reece"
            ? { productName: product.productName }
            : {
                productName: product.productName,
                productSku: product.productSku,
              };

        await Schema.findOneAndUpdate(
          query,
          { ...product, outOfStock: false, productModified: new Date() },
          { upsert: true, new: true }
        );
      } catch (error) {
        console.error(
          `Failed to update or insert product: ${product.productName}`,
          error
        );
      }
    }

    const productNames = productArray.map((p) => p.productName);
    const productSkus = productArray.map((p) => p.productSku);

    await Schema.updateMany(
      {
        $and: [
          { productName: { $nin: productNames } },
          { productSku: { $nin: productSkus } },
        ],
      },
      {
        $set: {
          outOfStock: true,
          productStatus: false,
          productModified: new Date(),
        },
      }
    );

    console.log("Record save successfully");
    return productArray;
  } catch (err) {
    console.error("Error in productRecordsSaveInDB:", err);
    return "";
  }
}

module.exports = { productRecordsSaveInDB };
