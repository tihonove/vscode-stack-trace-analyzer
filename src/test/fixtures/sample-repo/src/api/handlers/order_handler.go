package handlers

import "errors"

func Handle(orderID int) error {
	if orderID <= 0 {
		return errors.New("invalid order")
	}
	return nil
}
