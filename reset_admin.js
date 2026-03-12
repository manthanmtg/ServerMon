const mongoose = require('mongoose');
const argon2 = require('argon2');

const UserSchema = new mongoose.Schema({
    username: String,
    passwordHash: String,
    isActive: Boolean,
    totpEnabled: Boolean
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

async function resetAdmin() {
    const mongoUri = process.argv[2];
    if (!mongoUri) {
        console.error('Usage: node reset_admin.js <mongo_uri>');
        process.exit(1);
    }
    await mongoose.connect(mongoUri);
    
    const hashedPassword = await argon2.hash('password123');
    const result = await User.updateOne(
        { username: 'admin' },
        { 
            $set: { 
                passwordHash: hashedPassword,
                totpEnabled: false 
            } 
        }
    );
    
    console.log('Reset result:', result);
    process.exit(0);
}

resetAdmin().catch(err => {
    console.error(err);
    process.exit(1);
});
