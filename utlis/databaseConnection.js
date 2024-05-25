const mongoose = require("mongoose");

const connectDb = async () => {
  try {
    const conn = await mongoose.connect(
      "mongodb+srv://bluebuy:4WtsdkMtD9kDhLA0@cluster0.kro1gxc.mongodb.net/bluebuy_scrapping?retryWrites=true&w=majority"
    );
    console.log(`MongoDB Connected:- ${conn.connection.host}`);
  } catch (err) {
    console.log(`Error: ${err.message}`);
    process.exit();
  }
};

module.exports = connectDb;
