import dashboardService from '../services/dashboard.service.js';

const dashboardController = {
  async summary(req, res) {
    const summary = await dashboardService.summary(req.user.businessId);
    res.json(summary);
  },
};

export default dashboardController;
