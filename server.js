require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer config for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, '.')));
app.use('/uploads', express.static(uploadDir));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    retryWrites: true,
    w: 'majority',
    maxPoolSize: 40,
    minPoolSize: 10,
    maxIdleTimeMS: 45000
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.error('❌ MongoDB Connection Error:', err));

// Connection event handlers
mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB Disconnected');
});

mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB Connection Error:', err);
});

mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB Reconnected');
});

// Schemas

// Chat Data Schema
const ChatDataSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    date: { type: String, default: () => new Date().toLocaleString('vi-VN') },
    questionCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

// Carousel Images Schema
const CarouselImageSchema = new mongoose.Schema({
    title: { type: String, required: true },
    imageUrl: { type: String, required: true },
    alt: { type: String, default: '' },
    order: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

// Visitor Counter Schema
const VisitorCounterSchema = new mongoose.Schema({
    count: { type: Number, default: 0, required: true },
    lastUpdated: { type: Date, default: Date.now }
});

// Question Request Counter Schema
const QuestionRequestCounterSchema = new mongoose.Schema({
    count: { type: Number, default: 0, required: true },
    lastUpdated: { type: Date, default: Date.now }
});

// Models
const ChatData = mongoose.model('ChatData', ChatDataSchema);
const CarouselImage = mongoose.model('CarouselImage', CarouselImageSchema);
const VisitorCounter = mongoose.model('VisitorCounter', VisitorCounterSchema);
const QuestionRequestCounter = mongoose.model('QuestionRequestCounter', QuestionRequestCounterSchema);

// Initialize Visitor Counter
async function initializeVisitorCounter() {
    try {
        const counter = await VisitorCounter.findOne();
        if (!counter) {
            const newCounter = new VisitorCounter({ count: 0 });
            await newCounter.save();
            console.log('✅ Visitor counter initialized');
        }
    } catch (err) {
        console.error('❌ Error initializing visitor counter:', err);
    }
}

// Initialize Question Request Counter
async function initializeQuestionRequestCounter() {
    try {
        const counter = await QuestionRequestCounter.findOne();
        if (!counter) {
            const newCounter = new QuestionRequestCounter({ count: 0 });
            await newCounter.save();
            console.log('✅ Question request counter initialized');
        }
    } catch (err) {
        console.error('❌ Error initializing question request counter:', err);
    }
}

// Call initialization after MongoDB connects
mongoose.connection.once('open', () => {
    initializeVisitorCounter();
    initializeQuestionRequestCounter();
});

// Helper function to ensure database connection is ready
function isMongoReady() {
    return mongoose.connection.readyState === 1;
}

// Middleware to check database connection
app.use((req, res, next) => {
    if (!isMongoReady()) {
        return res.status(503).json({
            success: false,
            error: 'Database not connected',
            message: 'Please try again in a few moments'
        });
    }
    next();
});

// Routes

// ========== VISITOR COUNTER ROUTES ==========

// Increment visitor count (called when page loads)
app.post('/api/visitor', async (req, res) => {
    let retries = 2;
    while (retries > 0) {
        try {
            let counter = await VisitorCounter.findOne().maxTimeMS(5000);
            
            if (!counter) {
                counter = new VisitorCounter({ count: 1 });
            } else {
                counter.count += 1;
                counter.lastUpdated = new Date();
            }
            
            await counter.save();
            
            return res.json({
                success: true,
                count: counter.count,
                lastUpdated: counter.lastUpdated
            });
        } catch (err) {
            retries--;
            if (retries === 0) {
                console.error('❌ Visitor counter error:', err.message);
                return res.status(500).json({
                    success: false,
                    error: 'Không thể cập nhật số lượt truy cập',
                    details: err.message
                });
            }
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        }
    }
});

// Get visitor count (without incrementing)
app.get('/api/visitor', async (req, res) => {
    let retries = 2;
    while (retries > 0) {
        try {
            let counter = await VisitorCounter.findOne().maxTimeMS(5000);
            
            if (!counter) {
                counter = new VisitorCounter({ count: 0 });
                await counter.save();
            }
            
            return res.json({
                success: true,
                count: counter.count,
                lastUpdated: counter.lastUpdated
            });
        } catch (err) {
            retries--;
            if (retries === 0) {
                console.error('❌ Get visitor count error:', err.message);
                return res.status(500).json({
                    success: false,
                    error: 'Không thể lấy số lượt truy cập',
                    details: err.message
                });
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
});

// Reset visitor count (admin only)
app.post('/api/visitor/reset', async (req, res) => {
    let retries = 2;
    while (retries > 0) {
        try {
            let counter = await VisitorCounter.findOne().maxTimeMS(5000);
            
            if (!counter) {
                counter = new VisitorCounter({ count: 0 });
            } else {
                counter.count = 0;
                counter.lastUpdated = new Date();
            }
            
            await counter.save();
            
            return res.json({
                success: true,
                message: 'Đã reset số lượt truy cập về 0',
                count: counter.count
            });
        } catch (err) {
            retries--;
            if (retries === 0) {
                console.error('❌ Reset visitor count error:', err.message);
                return res.status(500).json({
                    success: false,
                    error: 'Không thể reset số lượt truy cập',
                    details: err.message
                });
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
});

// ========== QUESTION REQUEST COUNTER ROUTES ==========

// Increment question request count (called when user sends a question)
app.post('/api/questions/request', async (req, res) => {
    let retries = 2;
    while (retries > 0) {
        try {
            let counter = await QuestionRequestCounter.findOne().maxTimeMS(5000);
            
            if (!counter) {
                counter = new QuestionRequestCounter({ count: 1 });
            } else {
                counter.count += 1;
                counter.lastUpdated = new Date();
            }
            
            await counter.save();
            
            return res.json({
                success: true,
                count: counter.count,
                lastUpdated: counter.lastUpdated
            });
        } catch (err) {
            retries--;
            if (retries === 0) {
                console.error('❌ Question request counter error:', err.message);
                return res.status(500).json({
                    success: false,
                    error: 'Không thể cập nhật số lượng câu hỏi',
                    details: err.message
                });
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
});

// Get question request count
app.get('/api/questions/request', async (req, res) => {
    let retries = 2;
    while (retries > 0) {
        try {
            let counter = await QuestionRequestCounter.findOne().maxTimeMS(5000);
            
            if (!counter) {
                counter = new QuestionRequestCounter({ count: 0 });
                await counter.save();
            }
            
            return res.json({
                success: true,
                count: counter.count,
                lastUpdated: counter.lastUpdated
            });
        } catch (err) {
            retries--;
            if (retries === 0) {
                console.error('❌ Get question request count error:', err.message);
                return res.status(500).json({
                    success: false,
                    error: 'Không thể lấy số lượng câu hỏi',
                    details: err.message
                });
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
});

// Reset question request count (admin only)
app.post('/api/questions/request/reset', async (req, res) => {
    let retries = 2;
    while (retries > 0) {
        try {
            let counter = await QuestionRequestCounter.findOne().maxTimeMS(5000);
            
            if (!counter) {
                counter = new QuestionRequestCounter({ count: 0 });
            } else {
                counter.count = 0;
                counter.lastUpdated = new Date();
            }
            
            await counter.save();
            
            return res.json({
                success: true,
                message: 'Đã reset số lượng câu hỏi về 0',
                count: counter.count
            });
        } catch (err) {
            retries--;
            if (retries === 0) {
                console.error('❌ Reset question request count error:', err.message);
                return res.status(500).json({
                    success: false,
                    error: 'Không thể reset số lượng câu hỏi',
                    details: err.message
                });
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
});

// ========== CHAT DATA ROUTES ==========

// Get all data
app.get('/api/data', async (req, res) => {
    try {
        const data = await ChatData.find().sort({ createdAt: -1 }).maxTimeMS(10000);
        // Map _id to id for frontend compatibility
        const formattedData = data.map(item => ({
            id: item._id,
            title: item.title,
            content: item.content,
            date: item.date
        }));
        res.json(formattedData);
    } catch (err) {
        console.error('❌ Get all data error:', err.message);
        res.status(500).json({ 
            error: 'Không thể lấy dữ liệu',
            details: err.message 
        });
    }
});

// Add new data
app.post('/api/data', async (req, res) => {
    try {
        const { title, content } = req.body;
        const newData = new ChatData({ title, content });
        await newData.save();
        res.json({
            id: newData._id,
            title: newData.title,
            content: newData.content,
            date: newData.date
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Increment question count for a specific question
app.post('/api/data/:id/increment', async (req, res) => {
    try {
        const data = await ChatData.findByIdAndUpdate(
            req.params.id,
            { $inc: { questionCount: 1 } },
            { new: true }
        );
        
        if (!data) {
            return res.status(404).json({ error: 'Question not found' });
        }
        
        res.json({
            success: true,
            id: data._id,
            title: data.title,
            questionCount: data.questionCount
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get total question count
app.get('/api/questions/total-count', async (req, res) => {
    try {
        const questions = await ChatData.find().maxTimeMS(10000);
        const totalCount = questions.reduce((sum, q) => sum + (q.questionCount || 0), 0);
        
        res.json({
            success: true,
            totalCount: totalCount,
            totalQuestions: questions.length
        });
    } catch (err) {
        console.error('❌ Get total question count error:', err.message);
        res.status(500).json({ 
            error: 'Không thể lấy số lượng câu hỏi',
            details: err.message 
        });
    }
});

// Delete data
app.delete('/api/data/:id', async (req, res) => {
    try {
        await ChatData.findByIdAndDelete(req.params.id);
        res.json({ message: 'Deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== CAROUSEL ROUTES ==========

// Get carousel images
app.get('/api/carousel', async (req, res) => {
    try {
        const images = await CarouselImage.find().sort({ order: 1 });
        res.json(images);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add carousel image
app.post('/api/carousel', async (req, res) => {
    try {
        const { title, imageUrl, alt, order } = req.body;
        const newImage = new CarouselImage({ title, imageUrl, alt, order: order || 0 });
        await newImage.save();
        res.json(newImage);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Upload carousel image
app.post('/api/carousel/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        const { title, alt, order } = req.body;
        const imageUrl = `/uploads/${req.file.filename}`;

        const newImage = new CarouselImage({
            title: title || 'Untitled',
            imageUrl: imageUrl,
            alt: alt || '',
            order: order || 0
        });

        await newImage.save();
        res.json({
            success: true,
            message: 'Image uploaded successfully',
            data: newImage
        });
    } catch (err) {
        // Clean up uploaded file if DB save fails
        if (req.file) {
            fs.unlink(req.file.path, () => {});
        }
        res.status(400).json({ error: err.message });
    }
});

// Upload carousel image with base64
app.post('/api/carousel/upload-base64', async (req, res) => {
    try {
        const { title, imageData, alt, order } = req.body;

        if (!imageData) {
            return res.status(400).json({ error: 'No image data provided' });
        }

        // Remove data:image/...;base64, prefix if exists
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const filename = `base64-${Date.now()}-${Math.round(Math.random() * 1E9)}.png`;
        const filepath = path.join(uploadDir, filename);

        // Write base64 to file
        fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));

        const imageUrl = `/uploads/${filename}`;

        const newImage = new CarouselImage({
            title: title || 'Untitled',
            imageUrl: imageUrl,
            alt: alt || '',
            order: order || 0
        });

        await newImage.save();
        res.json({
            success: true,
            message: 'Image uploaded successfully',
            data: newImage
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Delete carousel image
app.delete('/api/carousel/:id', async (req, res) => {
    try {
        const image = await CarouselImage.findByIdAndDelete(req.params.id);
        
        // Delete image file from server if it exists
        if (image && image.imageUrl && image.imageUrl.startsWith('/uploads/')) {
            const filepath = path.join(__dirname, image.imageUrl);
            fs.unlink(filepath, (err) => {
                if (err) console.error('Error deleting file:', err);
            });
        }
        
        res.json({ message: 'Deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== FRONTEND ROUTES ==========

// Serve frontend files
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Visitor counter API: POST http://localhost:${PORT}/api/visitor`);
});