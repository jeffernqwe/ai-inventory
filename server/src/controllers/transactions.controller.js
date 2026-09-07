import { parsePagination, pageResult } from '../utils/pagination.js';
import { optionalObjectId } from '../utils/validate.js';
import { throwValidation } from '../utils/errors.js';
import transactionsService, { TRANSACTION_TYPES } from '../services/transactions.service.js';

function parseDateParam(value, field, problems) {
  if (value === undefined || value === null || value === '') return undefined;
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (trimmed === '') return undefined;
  if (Number.isNaN(Date.parse(trimmed))) {
    problems.push({ field, message: `${field} must be a valid date` });
    return undefined;
  }
  return trimmed;
}

const transactionsController = {
  /** Inventory transaction history, newest first. */
  async list(req, res) {
    const { page, limit, skip } = parsePagination(req.query);
    const problems = [];

    let type;
    if (req.query.type !== undefined) {
      if (TRANSACTION_TYPES.includes(req.query.type)) type = req.query.type;
      else problems.push({ field: 'type', message: `type must be one of ${TRANSACTION_TYPES.join(', ')}` });
    }

    const productId = optionalObjectId(req.query.productId, 'productId');
    problems.push(...productId.problems);
    const locationId = optionalObjectId(req.query.locationId, 'locationId');
    problems.push(...locationId.problems);

    const from = parseDateParam(req.query.from, 'from', problems);
    const to = parseDateParam(req.query.to, 'to', problems);

    if (problems.length) throwValidation(problems);

    const { items, total } = await transactionsService.list(req.user.businessId, {
      productId: productId.value,
      locationId: locationId.value,
      type,
      from,
      to,
      skip,
      limit,
    });
    res.json(pageResult(items, total, page, limit));
  },
};

export default transactionsController;
