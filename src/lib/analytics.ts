import connectDB from './db';
import AnalyticsEvent from '@/models/AnalyticsEvent';

export class AnalyticsService {
    private static instance: AnalyticsService;

    private constructor() { }

    public static getInstance(): AnalyticsService {
        if (!AnalyticsService.instance) {
            AnalyticsService.instance = new AnalyticsService();
        }
        return AnalyticsService.instance;
    }

    /**
     * Track a system or module event
     */
    public async track(data: {
        moduleId: string;
        event: string;
        metadata?: any;
        severity?: 'info' | 'warn' | 'error';
    }) {
        try {
            await connectDB();
            const newEvent = new AnalyticsEvent({
                ...data,
                timestamp: new Date(),
            });
            await newEvent.save();
        } catch (err) {
            console.error('[AnalyticsService] Failed to track event:', err);
        }
    }

    /**
     * Get recent events with filtering
     */
    public async getRecentEvents(limit: number = 50, filter: any = {}) {
        try {
            await connectDB();
            return await AnalyticsEvent.find(filter)
                .sort({ timestamp: -1 })
                .limit(limit)
                .lean();
        } catch (err) {
            console.error('[AnalyticsService] Failed to fetch events:', err);
            return [];
        }
    }
}

export const analyticsService = AnalyticsService.getInstance();
